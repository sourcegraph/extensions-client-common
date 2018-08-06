import { ClientOptions } from 'cxp/lib/client/client'
import {
    CloseAction,
    ErrorAction,
    ErrorHandler as CXPErrorHandler,
    InitializationFailedHandler,
} from 'cxp/lib/client/errorHandler'
import { ClientKey, Controller } from 'cxp/lib/environment/controller'
import { Environment } from 'cxp/lib/environment/environment'
import { Extension } from 'cxp/lib/environment/extension'
import { MessageTransports } from 'cxp/lib/jsonrpc2/connection'
import { Message, ResponseError } from 'cxp/lib/jsonrpc2/messages'
import { BrowserConsoleTracer } from 'cxp/lib/jsonrpc2/trace'
import { createWebSocketMessageTransports } from 'cxp/lib/jsonrpc2/transports/browserWebSocket'
import { createWebWorkerMessageTransports } from 'cxp/lib/jsonrpc2/transports/webWorker'
import { InitializeError } from 'cxp/lib/protocol'
import { catchError, map, mergeMap, take } from 'rxjs/operators'
import { Context } from '../context'
import { Settings } from '../copypasta'
import { ErrorLike, isErrorLike } from '../errors'
import { SourcegraphExtension } from '../schema/extension.schema'
import { ConfigurationSubject } from '../settings'
import { getSavedClientTrace } from './client'
import { importScriptsBlobURL } from './webWorker'

/**
 * Adds the manifest to CXP extensions in the CXP environment, so we can consult it in the createMessageTransports
 * callback (to know how to communicate with or run the extension).
 */
export interface CXPExtensionWithManifest extends Extension {
    isEnabled: boolean
    manifest: SourcegraphExtension | null | ErrorLike
}

/**
 * React props or state containing the CXP controller. There should be only a single CXP controller for the whole
 * application.
 */
export interface CXPControllerProps {
    /**
     * The CXP controller, which is used to communicate with the extensions and manages extensions based on the CXP
     * environment.
     */
    cxpController: Controller<CXPExtensionWithManifest>
}

interface CXPInitializationFailedHandler {
    initializationFailed: InitializationFailedHandler
}

/** The CXP client initializion-failed and error handler. */
class ErrorHandler implements CXPInitializationFailedHandler, CXPErrorHandler {
    /** The number of connection times to record. */
    private static MAX_CONNECTION_TIMESTAMPS = 4

    /** The timestamps of the last connection initiation times, with the 0th element being the oldest. */
    private connectionTimestamps: number[] = [Date.now()]

    public constructor(private extensionID: string) {}

    public error(err: Error, message: Message, count: number): ErrorAction {
        log(
            'error',
            `${this.extensionID}${count > 1 ? ` (count: ${count})` : ''}`,
            err,
            message ? { message } : undefined
        )

        if (err.message && err.message.includes('got unsubscribed')) {
            return ErrorAction.ShutDown
        }

        // Language servers differ in when they decide to return an error vs. just return an empty result. This
        // constant here is a guess that should be adjusted.
        if (count && count <= 5) {
            return ErrorAction.Continue
        }
        return ErrorAction.ShutDown
    }

    private computeDelayBeforeRetry(): number {
        const lastRestart: number | undefined = this.connectionTimestamps[this.connectionTimestamps.length - 1]
        const now = Date.now()

        // Bound the size of the array.
        if (this.connectionTimestamps.length === ErrorHandler.MAX_CONNECTION_TIMESTAMPS) {
            this.connectionTimestamps.shift()
        }
        this.connectionTimestamps.push(now)

        const diff = now - (lastRestart || 0)
        if (diff <= 10 * 1000) {
            // If the connection was created less than 10 seconds ago, wait longer to restart to avoid excessive
            // attempts.
            return 2500
        }
        // Otherwise restart after a shorter period.
        return 500
    }

    public initializationFailed(err: ResponseError<InitializeError> | Error | any): boolean | Promise<boolean> {
        log('error', this.extensionID, err)

        const EINVALIDREQUEST = -32600 // JSON-RPC 2.0 error code

        if (
            isResponseError(err) &&
            ((err.message.includes('dial tcp') && err.message.includes('connect: connection refused')) ||
                (err.code === EINVALIDREQUEST && err.message.includes('client proxy handler is already initialized')))
        ) {
            return false
        }

        const retry = isResponseError(err) && !!err.data && err.data.retry && this.connectionTimestamps.length === 0
        return delayed(retry, this.computeDelayBeforeRetry())
    }

    public closed(): CloseAction | Promise<CloseAction> {
        if (this.connectionTimestamps.length === ErrorHandler.MAX_CONNECTION_TIMESTAMPS) {
            const diff = this.connectionTimestamps[this.connectionTimestamps.length - 1] - this.connectionTimestamps[0]
            if (diff <= 60 * 1000) {
                // Stop restarting the server if it has restarted n times in the last minute.
                return CloseAction.DoNotReconnect
            }
        }

        return delayed(CloseAction.Reconnect, this.computeDelayBeforeRetry())
    }
}

/**
 * Filter the environment to omit extensions that should not be activated (based on their manifest's
 * activationEvents).
 */
function environmentFilter(
    nextEnvironment: Environment<CXPExtensionWithManifest>
): Environment<CXPExtensionWithManifest> {
    return {
        ...nextEnvironment,
        extensions:
            nextEnvironment.extensions &&
            nextEnvironment.extensions.filter(x => {
                try {
                    const component = nextEnvironment.component
                    if (x.isEnabled && x.manifest && !isErrorLike(x.manifest) && x.manifest.activationEvents) {
                        return x.manifest.activationEvents.some(
                            e => e === '*' || (!!component && e === `onLanguage:${component.document.languageId}`)
                        )
                    }
                } catch (err) {
                    console.error(err)
                }
                return false
            }),
    }
}

/**
 * Creates the CXP controller, which handles all CXP communication between the React app and CXP extension.
 *
 * There should only be a single controller for the entire application. The controller's environment represents all
 * of the application state that the controller needs to know.
 *
 * It receives state updates via calls to the setEnvironment method from React components. It provides results to
 * React components via its registries and the showMessages, etc., observables.
 */
export function createController<S extends ConfigurationSubject, C = Settings>(
    context: Context<S, C>
): Controller<CXPExtensionWithManifest> {
    const controller = new Controller({
        clientOptions: (key: ClientKey, options: ClientOptions, extension: CXPExtensionWithManifest) => {
            const errorHandler = new ErrorHandler(extension.id)
            return {
                createMessageTransports: () => createMessageTransports(extension, options),
                initializationFailedHandler: err => errorHandler.initializationFailed(err),
                errorHandler,
                trace: getSavedClientTrace(key),
                tracer: new BrowserConsoleTracer(extension.id),
            }
        },
        environmentFilter,
    })

    function messageFromExtension(extension: string, message: string): string {
        return `From extension ${extension}:\n\n${message}`
    }
    controller.showMessages.subscribe(({ extension, message }) => alert(messageFromExtension(extension, message)))
    controller.showMessageRequests.subscribe(({ extension, message, actions, resolve }) => {
        if (!actions || actions.length === 0) {
            alert(messageFromExtension(extension, message))
            resolve(null)
            return
        }
        const value = prompt(
            messageFromExtension(
                extension,
                `${message}\n\nValid responses: ${actions.map(({ title }) => JSON.stringify(title)).join(', ')}`
            ),
            actions[0].title
        )
        resolve(actions.find(a => a.title === value) || null)
    })
    controller.showInputs.subscribe(({ extension, message, defaultValue, resolve }) =>
        resolve(prompt(messageFromExtension(extension, message), defaultValue))
    )
    controller.configurationUpdates
        .pipe(
            mergeMap(params =>
                // Find the highest-precedence subject and edit its configuration.
                //
                // TODO(sqs): Allow extensions to specify which subject's configuration to update
                // (instead of always updating the highest-precedence subject's configuration).
                context.configurationCascade.pipe(
                    take(1),
                    map(x => x.subjects[x.subjects.length - 1]),
                    map(subject =>
                        context
                            .updateExtensionSettings(subject.subject, {
                                extensionID: params.extension,
                                edit: params,
                            })
                            .pipe(
                                // TODO(sqs): Apply updated settings for this extension in the React component hierarchy, e.g. by
                                // somehow calling this.props.onExtensionsChange and merging in the update.
                                catchError(err => {
                                    console.error(err)
                                    return []
                                })
                            )
                    )
                )
            )
        )
        .subscribe(undefined, err => console.error(err))

    // Print window/logMessage log messages to the browser devtools console.
    controller.logMessages.subscribe(({ message, extension }) => {
        log('info', extension, message)
    })

    // Debug helpers.
    const DEBUG = true
    if (DEBUG) {
        // Debug helper: log environment changes.
        const LOG_ENVIRONMENT = false
        if (LOG_ENVIRONMENT) {
            controller.environment.environment.subscribe(environment => log('info', 'env', environment))
        }

        // Debug helpers: e.g., just run `cxp` in devtools to get a reference to this controller. (If multiple
        // controllers are created, this points to the last one created.)
        Object.defineProperty(window, 'cxp', {
            get: () => controller,
        })
        Object.defineProperty(window, 'cxpenv', {
            get: () => controller.environment.environment.value,
        })
    }

    return controller
}

function createMessageTransports(
    extension: CXPExtensionWithManifest,
    options: ClientOptions
): Promise<MessageTransports> {
    if (!extension.manifest) {
        throw new Error(`unable to connect to extension ${JSON.stringify(extension.id)}: no manifest found`)
    }
    if (isErrorLike(extension.manifest)) {
        throw new Error(
            `unable to connect to extension ${JSON.stringify(extension.id)}: invalid manifest: ${
                extension.manifest.message
            }`
        )
    }
    if (extension.manifest.platform.type === 'bundle') {
        const APPLICATION_JSON_MIME_TYPE = 'application/json'
        if (
            typeof extension.manifest.platform.contentType === 'string' &&
            extension.manifest.platform.contentType !== APPLICATION_JSON_MIME_TYPE
        ) {
            // Until these are supported, prevent people from
            throw new Error(
                `unable to run extension ${JSON.stringify(extension.id)} bundle: content type ${JSON.stringify(
                    extension.manifest.platform.contentType
                )} is not supported (use ${JSON.stringify(APPLICATION_JSON_MIME_TYPE)})`
            )
        }
        const worker = new Worker(importScriptsBlobURL(extension.id, extension.manifest.platform.url))
        return Promise.resolve(createWebWorkerMessageTransports(worker))
    }

    // Include ?mode=&repo= in the url to make it easier to find the correct WebSocket connection in (e.g.) the
    // Chrome network inspector. It does not affect any behaviour.
    const url = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/.api/lsp?mode=${
        extension.id
    }&rootUri=${options.root}`
    return createWebSocketMessageTransports(new WebSocket(url))
}

function isResponseError(err: any): err is ResponseError<InitializeError> {
    return 'code' in err && 'message' in err
}

function delayed<T>(value: T, msec: number): Promise<T> {
    return new Promise(resolve => {
        setTimeout(() => resolve(value), msec)
    })
}

function log(level: 'info' | 'error', subject: string, message: any, other?: { [name: string]: any }): void {
    let f: typeof console.log
    let color: string
    let backgroundColor: string
    if (level === 'info') {
        f = console.log
        color = '#000'
        backgroundColor = '#eee'
    } else {
        f = console.error
        color = 'white'
        backgroundColor = 'red'
    }
    f(
        '%c CXP %s %c',
        `font-weight:bold;background-color:${backgroundColor};color:${color}`,
        subject,
        'font-weight:normal;background-color:unset',
        message,
        other || ''
    )
}

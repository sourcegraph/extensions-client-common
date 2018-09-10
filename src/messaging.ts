import { fromEvent, Observable } from 'rxjs'
import { filter, map, take } from 'rxjs/operators'
import { UpdateExtensionSettingsArgs } from './context'

/**
 * One end of the client-page connection. The browser extension is a client, and
 * the web app is a page.
 */
export type Source = 'Client' | 'Page'

/** Useful for building tagged union types. */
interface Tagged<T> {
    type: T
}

/**
 * Enumeration of all the types of messages that could be sent between the page
 * and client.
 */
type MessageType = 'Ping' | 'EditSettings' | 'GetSettings' | 'Settings'

/**
 * The first message sent between the page and client, and used to detect
 * presence of each other.
 */
export interface Ping extends Tagged<MessageType> {
    type: 'Ping'
}

/**
 * Intent to change a settings value. This is sent from the page to the client.
 */
export interface EditSettings extends Tagged<MessageType> {
    type: 'EditSettings'
    edit: UpdateExtensionSettingsArgs
}

/**
 * A request for the client to send the latest settings back. This is sent from
 * the page to the client.
 */
export interface GetSettings extends Tagged<MessageType> {
    type: 'GetSettings'
}

/**
 * A notification that the client settings have been updated. This is sent from
 * the client to the page.
 */
export interface Settings extends Tagged<MessageType> {
    type: 'Settings'
    settings: string
}

/** A message that is passed between the client and page. */
type Message = Ping | EditSettings | GetSettings | Settings

/** A connection to the client. */
export interface ClientConnection {
    /** Listens for the latest client settings. */
    onSettings: (callback: (settings: string) => void) => void

    /** Tells the client to update a setting. */
    editSettings: (edit: UpdateExtensionSettingsArgs) => void

    /** Asks the client for its settings. */
    getSettings: () => void
}

/** A connection to the page. */
export interface PageConnection {
    /** Listens for requests to edit settings. */
    onEditSettings: (callback: (edit: UpdateExtensionSettingsArgs) => void) => void

    /** Listens for requests for the latest settings. */
    onGetSettings: (callback: () => void) => void

    /** Notifies the page that the settings have been updated. */
    sendSettings: (settings: string) => void
}

/** A low-level connection between the client and page. */
interface Connection {
    onMessage: (callback: (message: Message) => void) => void
    sendMessage: (message: Message) => void
}

/**
 * Attempts to connect to the client/page and only resolves when the other end
 * pings back.
 *
 * Both the page and client send out an initial Ping, then another Ping for any
 * Ping that it receives from the other end. That way, both the page and client
 * will receive a ping no matter which one executes first. The receipt of a Ping
 * signals that the other end is present and ready to receive other messages.
 */
function connectTo(other: Source): Promise<Connection> {
    const me = { Client: 'Page', Page: 'Client' }[other]

    return new Promise(resolve => {
        const incomingMessages: Observable<Message> = fromEvent<MessageEvent>(window, 'message').pipe(
            map<MessageEvent, Message & { source: Source } | undefined>(event => event.data),
            filter((message): message is Message & { source: Source } => !!message && message.source === other)
        )

        const connection: Connection = {
            onMessage: callback => {
                incomingMessages.subscribe(callback)
            },
            sendMessage: (message: Message): void => {
                window.postMessage({ source: me, ...message }, '*')
            },
        }

        const ping = () => connection.sendMessage({ type: 'Ping' })

        incomingMessages.pipe(take(1)).subscribe(() => {
            ping()
            resolve(connection)
        })
        ping()
    })
}

/** Resolves when the client is ready to exchange messages. */
export function connectToClient(): Promise<ClientConnection> {
    return connectTo('Client').then(connection => ({
        onSettings: (callback: (settings: string) => void) =>
            connection.onMessage(message => (message.type === 'Settings' ? callback(message.settings) : undefined)),
        getSettings: () => connection.sendMessage({ type: 'GetSettings' }),
        editSettings: (edit: UpdateExtensionSettingsArgs) => connection.sendMessage({ type: 'EditSettings', edit }),
    }))
}

/** Resolves when the page is ready to exchange messages. */
export function connectToPage(): Promise<PageConnection> {
    return connectTo('Page').then(connection => ({
        onEditSettings: (callback: (edit: UpdateExtensionSettingsArgs) => void) =>
            connection.onMessage(message => (message.type === 'EditSettings' ? callback(message.edit) : undefined)),
        onGetSettings: (callback: () => void) =>
            connection.onMessage(message => (message.type === 'GetSettings' ? callback() : undefined)),
        sendSettings: (settings: string) => connection.sendMessage({ type: 'Settings', settings }),
    }))
}

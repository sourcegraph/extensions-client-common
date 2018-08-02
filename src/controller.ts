import { isEqual } from 'lodash-es'
import { combineLatest, Observable, of, throwError } from 'rxjs'
import { catchError, distinctUntilChanged, filter, map, startWith, switchMap } from 'rxjs/operators'
import { ExtensionSettings, Settings, SourcegraphExtension } from './copypasta'
import { asError, createAggregateError, ErrorLike, isErrorLike } from './errors'
import { ConfigurationCascade } from './settings/cascade'

/**
 * A controller that exposes functionality for a configuration cascade and querying extensions from the remote
 * registry.
 */
export class Controller {
    public static readonly LOADING: 'loading' = 'loading'

    constructor(private gqlCascade: Observable<GQL.IConfigurationCascade>) {}

    public readonly cascade: Observable<ConfigurationCascade<Settings>> = this.gqlCascade.pipe(
        map(
            ({ subjects, merged }) =>
                ({
                    subjects: subjects.map(({ latestSettings, ...subject }) => ({
                        subject,
                        settings: latestSettings && parseJSONCOrError<Settings>(latestSettings.configuration.contents),
                    })),
                    // TODO(sqs): perform the merging on the client side too so we can merge in settings that are never stored on Sourcegraph
                    merged: parseJSONCOrError<Settings>(merged.contents),
                } as ConfigurationCascade<Settings>)
        ),
        distinctUntilChanged((a, b) => isEqual(a, b))
    )

    private readonly viewerConfiguredExtensionsOrLoading: Observable<
        typeof Controller.LOADING | ConfiguredExtension[] | ErrorLike
    > = this.cascade.pipe(
        switchMap(
            cascade =>
                isErrorLike(cascade.merged)
                    ? [cascade.merged]
                    : this.withRegistryMetadata(cascade).pipe(
                          catchError(error => [asError(error)]),
                          startWith(Controller.LOADING)
                      )
        )
    )

    public readonly viewerConfiguredExtensions: Observable<
        ConfiguredExtension[]
    > = this.viewerConfiguredExtensionsOrLoading.pipe(
        filter((extensions): extensions is ConfiguredExtension[] | ErrorLike => extensions !== Controller.LOADING),
        switchMap(extensions => (isErrorLike(extensions) ? throwError(extensions) : [extensions]))
    )

    public forExtensionID(
        extensionID: string,
        registryExtensionFragment: GraphQLDocument
    ): Observable<ConfiguredExtension> {
        return queryGraphQL(
            gql`
                query RegistryExtension($extensionID: String!) {
                    extensionRegistry {
                        extension(extensionID: $extensionID) {
                            ...RegistryExtensionFields
                        }
                    }
                }
                ${registryExtensionFragment}
            `,
            { extensionID }
        )
            .pipe(
                map(({ data, errors }) => {
                    if (!data || !data.extensionRegistry || !data.extensionRegistry.extension) {
                        throw createAggregateError(errors)
                    }
                    return data.extensionRegistry.extension
                })
            )
            .pipe(
                switchMap(registryExtension => this.withConfiguration(of([registryExtension]))),
                map(configuredExtensions => configuredExtensions[0])
            )
    }

    private withRegistryMetadata(cascade: ConfigurationCascade<Settings>): Observable<ConfiguredExtension[]> {
        if (isErrorLike(cascade.merged)) {
            return throwError(cascade.merged)
        }
        if (!cascade.merged || !cascade.merged.extensions) {
            return of([])
        }
        const extensionIDs = Object.keys(cascade.merged.extensions)
        return queryGraphQL(
            gql`
                query Extensions($first: Int!, $prioritizeExtensionIDs: [String!]!) {
                    extensionRegistry {
                        extensions(first: $first, prioritizeExtensionIDs: $prioritizeExtensionIDs) {
                            nodes {
                                id
                                extensionID
                                url
                                manifest {
                                    raw
                                }
                                viewerCanAdminister
                            }
                        }
                    }
                }
            `,
            {
                first: extensionIDs.length,
                prioritizeExtensionIDs: extensionIDs,
            }
        ).pipe(
            map(({ data, errors }) => {
                if (
                    !data ||
                    !data.extensionRegistry ||
                    !data.extensionRegistry.extensions ||
                    !data.extensionRegistry.extensions.nodes
                ) {
                    throw createAggregateError(errors)
                }
                return data.extensionRegistry.extensions.nodes.map(
                    ({ id, extensionID, url, manifest, viewerCanAdminister }) => ({
                        id,
                        extensionID,
                        url,
                        manifest: manifest ? { raw: manifest.raw } : null,
                        viewerCanAdminister,
                    })
                )
            }),
            map(registryExtensions => {
                const configuredExtensions: ConfiguredExtension[] = []
                for (const extensionID of extensionIDs) {
                    const registryExtension = registryExtensions.find(x => x.extensionID === extensionID)
                    configuredExtensions.push({
                        extensionID,
                        ...toSettingsProperties(cascade, extensionID),
                        manifest:
                            registryExtension && registryExtension.manifest
                                ? parseJSONCOrError(registryExtension.manifest.raw)
                                : null,
                        rawManifest:
                            (registryExtension && registryExtension.manifest && registryExtension.manifest.raw) || null,
                        registryExtension,
                    })
                }
                return configuredExtensions
            })
        )
    }

    public withConfiguration(
        registryExtensions: Observable<GQL.IRegistryExtension[]>
    ): Observable<ConfiguredExtension[]> {
        return combineLatest(registryExtensions, this.cascade).pipe(
            map(([registryExtensions, cascade]) => {
                const configuredExtensions: ConfiguredExtension[] = []
                for (const registryExtension of registryExtensions) {
                    configuredExtensions.push({
                        extensionID: registryExtension.extensionID,
                        ...toSettingsProperties(cascade, registryExtension.extensionID),
                        manifest: registryExtension.manifest
                            ? parseJSONCOrError<SourcegraphExtension>(registryExtension.manifest.raw)
                            : null,
                        rawManifest:
                            (registryExtension && registryExtension.manifest && registryExtension.manifest.raw) || null,
                        registryExtension,
                    })
                }
                return configuredExtensions
            })
        )
    }
}

function toSettingsProperties(
    cascade: ConfigurationCascade<Settings>,
    extensionID: string
): Pick<ConfiguredExtension, 'settings' | 'settingsCascade' | 'isEnabled' | 'isAdded'> {
    const settings = getExtensionSettings(cascade.merged, extensionID)
    return {
        settings,
        settingsCascade: cascade.subjects.map(({ subject, settings }) => ({
            subject,
            settings: getExtensionSettings(settings, extensionID),
        })),
        isEnabled: settings !== null && !isErrorLike(settings) && !settings.disabled,
        isAdded: settings !== null,
    }
}

function getExtensionSettings(
    settings: Settings | ErrorLike | null,
    extensionID: string
): ExtensionSettings | ErrorLike | null {
    if (isErrorLike(settings)) {
        return settings
    }
    if (settings === null) {
        return null
    }
    if (settings && settings.extensions && settings.extensions[extensionID]) {
        return settings.extensions[extensionID]
    }
    return null
}

function parseJSONCOrError<T>(input: string): T | ErrorLike {
    try {
        return parseJSON(input) as T
    } catch (err) {
        return asError(err)
    }
}

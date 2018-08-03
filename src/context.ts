import { Observable } from 'rxjs'
import { Controller } from './controller'
import { QueryResult } from './graphql'
import * as GQL from './schema/graphqlschema'
import { ConfigurationCascade, ConfigurationSubject } from './settings'

/**
 * Description of the context in which extensions-client-common is running, and platform-specific hooks.
 */
export interface Context<S extends ConfigurationSubject, C> {
    /**
     * An observable that emits whenever the configuration cascade changes (including when any individual subject's
     * settings change).
     */
    readonly configurationCascade: Observable<ConfigurationCascade<S, C>>

    /** Updates the extension settings for extensionID and for the given subject. */
    updateExtensionSettings(
        subject: Pick<GQL.ConfigurationSubject, 'id'>,
        args: {
            extensionID: string
            edit?: GQL.IConfigurationEdit
            enabled?: boolean
            remove?: boolean
        }
    ): Observable<void>

    /**
     * Sends a request to the Sourcegraph GraphQL API and returns the response.
     *
     * @param request The GraphQL request (query or mutation)
     * @param variables An object whose properties are GraphQL query name-value variable pairs
     * @return Observable that emits the result or an error if the HTTP request failed
     */
    queryGraphQL(
        request: string,
        variables?: { [name: string]: any }
    ): Observable<QueryResult<Pick<GQL.IQuery, 'extensionRegistry'>>>

    /**
     * React components for icons. They are expected to size themselves appropriately with the surrounding DOM flow
     * content.
     */
    readonly icons: Record<'Loader' | 'Warning', React.ComponentType<{ className: 'icon-inline' }>>
}

/**
 * React partial props for components needing the ExtensionsController.
 */
export interface ExtensionsProps<S extends ConfigurationSubject, C> {
    extensions: Controller<S, C>
}

import { Observable } from 'rxjs'
import { Controller } from './controller'
import { GraphQLDocument, GraphQLResponseRoot } from './graphql'
import { ConfigurationCascade, ConfigurationSubject } from './settings/cascade'

/**
 * Description of the context in which for-x is running, and platform-specific hooks.
 */
export interface Context<S extends ConfigurationSubject, C> {
    /**
     * An observable that emits whenever the configuration cascade changes (including when any individual subject's
     * settings change).
     */
    readonly configurationCascade: Observable<ConfigurationCascade<S, C>>

    /**
     * Sends a request to the Sourcegraph GraphQL API and returns the response.
     *
     * @param request The GraphQL request (query or mutation)
     * @param variables An object whose properties are GraphQL query name-value variable pairs
     * @return Observable that emits the result or an error if the HTTP request failed
     */
    requestGraphQL<D>(request: GraphQLDocument, variables?: { [name: string]: any }): Observable<GraphQLResponseRoot<D>>

    /**
     * A React component that displays a loading indicator and sizes itself appropriately with its surrounding DOM
     * flow content.
     */
    readonly LoaderIcon: React.ComponentType<{ className: 'icon-inline' }>
}

/**
 * React partial props for components needing Context.
 */
export interface ContextProps<S extends ConfigurationSubject, C> {
    forxContext: Context<S, C>
}

/**
 * React partial props for components needing the ExtensionsController.
 */
export interface ExtensionsProps {
    extensions: Controller
}

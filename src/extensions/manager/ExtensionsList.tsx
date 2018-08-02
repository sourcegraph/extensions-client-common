import Loader from '@sourcegraph/icons/lib/Loader'
import { upperFirst } from 'lodash'
import * as React from 'react'
import { RouteComponentProps } from 'react-router'
import { combineLatest, concat, Observable, of, Subject, Subscription } from 'rxjs'
import {
    catchError,
    debounceTime,
    delay,
    filter,
    map,
    switchMap,
    take,
    takeUntil,
    withLatestFrom,
} from 'rxjs/operators'
import { ExtensionsProps } from '../backend/features'
import { gql, queryGraphQL } from '../backend/graphql'
import * as GQL from '../backend/graphqlschema'
import { asError, createAggregateError, ErrorLike, isErrorLike } from '../util/errors'
import { ConfiguredExtensionNodeCard } from './ConfiguredExtensionNodeCard'
import { ConfiguredExtension } from './extension'

export interface ConfiguredExtensionNodeProps {
    node: ConfiguredExtension
    authenticatedUser: GQL.IUser | null
    onDidUpdate: () => void
}

interface Props extends ExtensionsProps, RouteComponentProps<{}> {
    authenticatedUser: GQL.IUser | null
    emptyElement?: React.ReactFragment
}

const LOADING: 'loading' = 'loading'

interface ConfiguredExtensionsResult {
    /** The configured extensions. */
    configuredExtensions: ConfiguredExtension[]

    /** An error message that should be displayed to the user (in addition to the configured extensions). */
    error: string | null
}

interface State {
    /** The current value of the query field. */
    query: string

    /** The data to display. */
    data: {
        /** The query that was used to retrieve the results. */
        query: string

        /** The results, loading, or an error. */
        resultOrError: typeof LOADING | ConfiguredExtensionsResult | ErrorLike
    }
}

/**
 * Displays a list of all extensions used by a configuration subject.
 */
export class ConfiguredExtensionsList extends React.PureComponent<Props, State> {
    private static URL_QUERY_PARAM = 'query'

    private updates = new Subject<void>()

    private componentUpdates = new Subject<Props>()
    private queryChanges = new Subject<string>()
    private subscriptions = new Subscription()

    constructor(props: Props) {
        super(props)
        this.state = {
            query: this.getQueryFromProps(props),
            data: { query: '', resultOrError: LOADING },
        }
    }

    private getQueryFromProps(props: Pick<Props, 'location'>): string {
        const params = new URLSearchParams(location.search)
        return params.get(ConfiguredExtensionsList.URL_QUERY_PARAM) || ''
    }

    public componentDidMount(): void {
        this.subscriptions.add(
            this.queryChanges.subscribe(query => {
                this.setState({ query })
            })
        )

        const debouncedQueryChanges = this.queryChanges.pipe(debounceTime(50))

        // Update URL when query field changes.
        this.subscriptions.add(
            debouncedQueryChanges.subscribe(query => {
                this.props.history.replace({
                    search: query
                        ? new URLSearchParams({ [ConfiguredExtensionsList.URL_QUERY_PARAM]: query }).toString()
                        : '',
                    hash: this.props.location.hash,
                })
            })
        )

        // Update query field when URL is changed manually.
        this.subscriptions.add(
            this.componentUpdates
                .pipe(
                    filter(({ history }) => history.action !== 'REPLACE'),
                    map(({ location }) => this.getQueryFromProps({ location })),
                    withLatestFrom(debouncedQueryChanges),
                    filter(([urlQuery, debouncedStateQuery]) => urlQuery !== debouncedStateQuery)
                )
                .subscribe(([urlQuery]) => this.setState({ query: urlQuery }))
        )

        this.subscriptions.add(
            combineLatest(debouncedQueryChanges)
                .pipe(
                    switchMap(([query]) => {
                        const resultOrError = this.queryRegistryExtensions({ query }).pipe(
                            catchError(err => [asError(err)])
                        )
                        return concat(
                            of(LOADING).pipe(
                                delay(250),
                                takeUntil(resultOrError)
                            ),
                            resultOrError
                        ).pipe(map(resultOrError => ({ data: { query, resultOrError } })))
                    })
                )
                .subscribe(stateUpdate => this.setState(stateUpdate))
        )

        this.componentUpdates.next(this.props)
        this.queryChanges.next(this.state.query)
    }

    public componentWillReceiveProps(nextProps: Props): void {
        this.componentUpdates.next(nextProps)
    }

    public componentWillUnmount(): void {
        this.subscriptions.unsubscribe()
    }

    public render(): JSX.Element | null {
        return (
            <div className="configured-extensions-list">
                <form onSubmit={this.onSubmit}>
                    <div className="form-group">
                        <input
                            className="form-control"
                            type="search"
                            placeholder="Search extensions..."
                            name="query"
                            value={this.state.query}
                            onChange={this.onQueryChange}
                            autoFocus={true}
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                        />
                    </div>
                </form>
                {this.state.data.resultOrError === LOADING ? (
                    <Loader className="icon-inline" />
                ) : isErrorLike(this.state.data.resultOrError) ? (
                    <div className="alert alert-danger">{upperFirst(this.state.data.resultOrError.message)}</div>
                ) : (
                    <>
                        {this.state.data.resultOrError.error && (
                            <div className="alert alert-danger my-2">{this.state.data.resultOrError.error}</div>
                        )}
                        {this.state.data.resultOrError.configuredExtensions.length === 0 ? (
                            this.state.data.query ? (
                                <span className="text-muted">
                                    No extensions matching <strong>{this.state.data.query}</strong>
                                </span>
                            ) : (
                                this.props.emptyElement || <span className="text-muted">No extensions found</span>
                            )
                        ) : (
                            <div className="row mt-3">
                                {this.state.data.resultOrError.configuredExtensions.map((e, i) => (
                                    <ConfiguredExtensionNodeCard
                                        key={i}
                                        authenticatedUser={this.props.authenticatedUser}
                                        node={e}
                                        onDidUpdate={this.onDidUpdateConfiguredExtension}
                                    />
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        )
    }

    private onSubmit: React.FormEventHandler = e => e.preventDefault()

    private onQueryChange: React.FormEventHandler<HTMLInputElement> = e => this.queryChanges.next(e.currentTarget.value)

    private queryRegistryExtensions = (args: { query?: string }): Observable<ConfiguredExtensionsResult> =>
        this.props.extensions.viewerConfiguredExtensions.pipe(
            // Avoid refreshing (and changing order) when the user merely interacts with an extension (e.g.,
            // toggling its enablement), to reduce UI jitter.
            take(1),

            switchMap(viewerConfiguredExtensions =>
                queryGraphQL(
                    gql`
                        query RegistryExtensions($query: String, $prioritizeExtensionIDs: [String!]!) {
                            extensionRegistry {
                                extensions(query: $query, prioritizeExtensionIDs: $prioritizeExtensionIDs) {
                                    nodes {
                                        ...RegistryExtensionFields
                                    }
                                    error
                                }
                            }
                        }
                        ${registryExtensionFragment}
                    `,
                    {
                        ...args,
                        prioritizeExtensionIDs: viewerConfiguredExtensions.map(({ extensionID }) => extensionID),
                    } as GQL.IExtensionsOnExtensionRegistryArguments
                ).pipe(
                    map(({ data, errors }) => {
                        if (!data || !data.extensionRegistry || !data.extensionRegistry.extensions || errors) {
                            throw createAggregateError(errors)
                        }
                        return {
                            registryExtensions: data.extensionRegistry.extensions.nodes,
                            error: data.extensionRegistry.extensions.error,
                        }
                    })
                )
            ),
            switchMap(({ registryExtensions, error }) =>
                this.props.extensions
                    .withConfiguration(of(registryExtensions))
                    .pipe(map(configuredExtensions => ({ configuredExtensions, error })))
            )
        )

    private onDidUpdateConfiguredExtension = () => this.updates.next()
}

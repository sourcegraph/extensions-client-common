import { Client as CXPClient, ClientState as CXPClientState } from 'cxp/lib/client/client'
import { ClientKey as CXPClientKey } from 'cxp/lib/environment/controller'
import { Trace } from 'cxp/lib/jsonrpc2/trace'
import * as React from 'react'
import { combineLatest, of, Subject, Subscription } from 'rxjs'
import { distinctUntilChanged, map, switchMap } from 'rxjs/operators'
import { PopoverButton } from '../components/PopoverButton'
import { updateSavedClientTrace } from './client'
import { CXPControllerProps } from './controller'

interface Props extends CXPControllerProps {
    caretIcon: React.ComponentType<{
        className: 'icon-inline' | string
        onClick?: () => void
    }>

    loaderIcon: React.ComponentType<{ className: 'icon-inline' }>
}

interface State {
    /** The CXP clients, or undefined while loading. */
    clients?: { client: CXPClient; key: CXPClientKey; state: CXPClientState }[]
}

export class CXPStatus extends React.PureComponent<Props, State> {
    public state: State = {}

    private componentUpdates = new Subject<Props>()
    private subscriptions = new Subscription()

    public componentDidMount(): void {
        const cxpController = this.componentUpdates.pipe(
            map(({ cxpController }) => cxpController),
            distinctUntilChanged()
        )

        this.subscriptions.add(
            cxpController
                .pipe(
                    switchMap(cxpController =>
                        cxpController.clientEntries.pipe(
                            switchMap(
                                clientEntries =>
                                    clientEntries.length === 0
                                        ? of([])
                                        : combineLatest(
                                              clientEntries.map(({ client, key }) =>
                                                  client.state.pipe(
                                                      distinctUntilChanged(),
                                                      map(state => ({ state, client, key }))
                                                  )
                                              )
                                          )
                            )
                        )
                    ),
                    map(clients => ({ clients }))
                )
                .subscribe(stateUpdate => this.setState(stateUpdate), err => console.error(err))
        )

        this.componentUpdates.next(this.props)
    }

    public componentDidUpdate(): void {
        this.componentUpdates.next(this.props)
    }

    public componentWillUnmount(): void {
        this.subscriptions.unsubscribe()
    }

    public render(): JSX.Element | null {
        return (
            <div className="cxp-status card border-0">
                <div className="card-header">CXP clients</div>
                {this.state.clients ? (
                    this.state.clients.length > 0 ? (
                        <div className="list-group list-group-flush">
                            {this.state.clients.map(({ client, key, state }, i) => (
                                <div
                                    key={i}
                                    className="cxp-status__client list-group-item d-flex align-items-center justify-content-between py-2"
                                >
                                    <span className="d-flex align-items-center">
                                        <span data-tooltip={key.root || 'no root'}>{client.id}</span>
                                        <span className={`badge badge-${clientStateBadgeClass(state)} ml-1`}>
                                            {CXPClientState[state]}
                                        </span>
                                    </span>
                                    <div className="cxp-status__client-actions d-flex align-items-center ml-3">
                                        <button
                                            className={`btn btn-sm btn-${
                                                client.trace === Trace.Off ? 'outline-' : ''
                                            }info p-0`}
                                            // tslint:disable-next-line:jsx-no-lambda
                                            onClick={() => this.onClientTraceClick(client, key)}
                                            data-tooltip={`${
                                                client.trace === Trace.Off ? 'Enable' : 'Disable'
                                            } trace in console`}
                                        >
                                            Log
                                        </button>
                                        {client.needsStop() && (
                                            <button
                                                className="btn btn-sm btn-outline-danger p-0 ml-1"
                                                // tslint:disable-next-line:jsx-no-lambda
                                                onClick={() => this.onClientStopClick(client)}
                                            >
                                                Stop
                                            </button>
                                        )}
                                        {!client.needsStop() && (
                                            <button
                                                className="btn btn-sm btn-outline-success p-0 ml-1"
                                                // tslint:disable-next-line:jsx-no-lambda
                                                onClick={() => this.onClientActivateClick(client)}
                                            >
                                                Start
                                            </button>
                                        )}
                                        {client.needsStop() && (
                                            <button
                                                className="btn btn-sm btn-outline-warning p-0 ml-1"
                                                // tslint:disable-next-line:jsx-no-lambda
                                                onClick={() => this.onClientResetClick(client)}
                                            >
                                                Restart
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <span className="card-body">No clients.</span>
                    )
                ) : (
                    <span className="card-body">
                        <this.props.loaderIcon className="icon-inline" /> Loading clients...
                    </span>
                )}
            </div>
        )
    }

    private onClientTraceClick = (client: CXPClient, key: CXPClientKey) => {
        client.trace = client.trace === Trace.Verbose ? Trace.Off : Trace.Verbose
        updateSavedClientTrace(key, client.trace)
        this.forceUpdate()
    }

    private onClientStopClick = (client: CXPClient) => client.stop()

    private onClientActivateClick = (client: CXPClient) => client.activate()

    private onClientResetClick = (client: CXPClient) => {
        let p = Promise.resolve<void>(void 0)
        if (client.needsStop()) {
            p = client.stop()
        }
        p.then(() => client.activate(), err => console.error(err))
    }
}

function clientStateBadgeClass(state: CXPClientState): string {
    switch (state) {
        case CXPClientState.Initial:
            return 'secondary'
        case CXPClientState.Connecting:
            return 'info'
        case CXPClientState.Initializing:
            return 'info'
        case CXPClientState.ActivateFailed:
            return 'danger'
        case CXPClientState.Active:
            return 'success'
        case CXPClientState.ShuttingDown:
            return 'warning'
        case CXPClientState.Stopped:
            return 'danger'
    }
}

/** A button that toggles the visibility of the CXPStatus element in a popover. */
export const CXPStatusPopover: React.SFC<Props> = props => (
    <PopoverButton
        caretIcon={props.caretIcon}
        placement="auto-end"
        globalKeyBinding="X"
        popoverElement={<CXPStatus {...props} />}
    >
        <span className="text-muted">CXP</span>
    </PopoverButton>
)

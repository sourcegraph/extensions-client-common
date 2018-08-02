import * as React from 'react'
import { Link } from 'react-router-dom'
import { LinkOrSpan } from '../../components/LinkOrSpan'
import { ContextProps } from '../../context'
import { isErrorLike } from '../../errors'
import * as GQL from '../../schema/graphqlschema'
import { ConfigurationSubject } from '../../settings/cascade'
import { ConfiguredExtension } from '../extension'
import { ExtensionEnablementToggle } from '../ExtensionEnablementToggle'
import {
    ADDED_AND_CAN_ADMINISTER,
    ALL_CAN_ADMINISTER,
    ExtensionConfigureButton,
    ExtensionConfiguredSubjectItemForAdd,
    ExtensionConfiguredSubjectItemForRemove,
} from './extension/ExtensionConfigureButton'

interface Props<S extends ConfigurationSubject, C> extends ContextProps<S, C> {
    node: ConfiguredExtension
    authenticatedUser: GQL.IUser | null
    onDidUpdate: () => void
}

/** Displays an extension as a card. */
export class ExtensionCard<S extends ConfigurationSubject, C> extends React.PureComponent<Props<S, C>> {
    public render(): JSX.Element | null {
        const { node, ...props } = this.props
        return (
            <div className="configured-extension-node-card col-sm-6 col-md-6 col-lg-4 pb-4">
                <div className="configured-extension-node-card__card card">
                    <LinkOrSpan
                        to={node.registryExtension && node.registryExtension.url}
                        className="card-body configured-extension-node-card__card-body d-flex flex-column"
                    >
                        <h4 className="card-title configured-extension-node-card__card-body-title mb-0">
                            {node.manifest && !isErrorLike(node.manifest) && node.manifest.title
                                ? node.manifest.title
                                : node.extensionID}
                        </h4>
                        <div className="configured-extension-node-card__card-body-text d-inline-block mt-1">
                            {node.manifest ? (
                                isErrorLike(node.manifest) ? (
                                    <span className="text-danger small" title={node.manifest.message}>
                                        <props.forxContext.icons.Warning className="icon-inline" /> Invalid manifest
                                    </span>
                                ) : (
                                    node.manifest.description && (
                                        <span className="text-muted">{node.manifest.description}</span>
                                    )
                                )
                            ) : (
                                <span className="text-warning small">
                                    <props.forxContext.icons.Warning className="icon-inline" /> No manifest
                                </span>
                            )}
                        </div>
                    </LinkOrSpan>
                    <div className="card-footer configured-extension-node-card__card-footer py-0 pl-0">
                        <ul className="nav align-items-center">
                            {node.registryExtension &&
                                node.registryExtension.url && (
                                    <li className="nav-item">
                                        <Link to={node.registryExtension.url} className="nav-link px-2" tabIndex={-1}>
                                            Details
                                        </Link>
                                    </li>
                                )}
                            <li className="configured-extension-node-card__card-spacer" />
                            {props.authenticatedUser && (
                                <>
                                    {node.isAdded &&
                                        !node.isEnabled && (
                                            <li className="nav-item">
                                                <ExtensionConfigureButton
                                                    extension={node}
                                                    onUpdate={props.onDidUpdate}
                                                    header="Remove extension for..."
                                                    itemFilter={ADDED_AND_CAN_ADMINISTER}
                                                    itemComponent={ExtensionConfiguredSubjectItemForRemove}
                                                    buttonClassName="btn-outline-link btn-sm py-0 mr-1"
                                                    caret={false}
                                                >
                                                    Remove
                                                </ExtensionConfigureButton>
                                            </li>
                                        )}
                                    {node.isAdded && (
                                        <li className="nav-item">
                                            <ExtensionEnablementToggle
                                                extension={node}
                                                subject={props.authenticatedUser}
                                                onChange={props.onDidUpdate}
                                                tabIndex={-1}
                                            />
                                        </li>
                                    )}
                                    {!node.isAdded && (
                                        <li className="nav-item">
                                            <ExtensionConfigureButton
                                                extension={node}
                                                onUpdate={props.onDidUpdate}
                                                header="Add extension for..."
                                                itemFilter={ALL_CAN_ADMINISTER}
                                                itemComponent={ExtensionConfiguredSubjectItemForAdd}
                                                buttonClassName="btn-primary btn-sm"
                                                caret={false}
                                            >
                                                Add
                                            </ExtensionConfigureButton>
                                        </li>
                                    )}
                                </>
                            )}
                        </ul>
                    </div>
                </div>
            </div>
        )
    }
}

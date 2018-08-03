import { ExtensionSettings } from '../copypasta'
import { ErrorLike } from '../errors'
import { SourcegraphExtension } from '../schema/extension.schema'
import * as GQL from '../schema/graphqlschema'
import { ConfigurationSubject, ConfiguredSubject } from '../settings'

/**
 * Describes a configured extension.
 *
 * TODO!(sqs): rename to ConfiguredExtension
 *
 * @template S the configuration subject type
 * @template C the settings type
 * @template RX the registry extension type
 */
export interface ConfiguredExtension<
    S extends ConfigurationSubject = ConfigurationSubject,
    C extends ExtensionSettings = ExtensionSettings,
    RX extends Pick<GQL.IRegistryExtension, 'id' | 'url' | 'viewerCanAdminister'> = Pick<
        GQL.IRegistryExtension,
        'id' | 'url' | 'viewerCanAdminister'
    >
> {
    /** The ID of the extension, unique on a Sourcegraph site. */
    extensionID: string

    /** The merged settings for the extension for the viewer. */
    settings: C | null // TODO(sqs): make this interface extend ConfigurationCascade<ExtensionSettings>
    // TODO(sqs): make this also | ErrorLike maybe? unless we remove this field altogether

    /** The settings for the extension at each level of the cascade. */
    settingsCascade: ConfiguredSubject<S, C>[]

    /** Whether the extension is enabled for the viewer. */
    isEnabled: boolean

    /** Whether the extension is added in the viewer's settings. */
    isAdded: boolean

    /** The parsed extension manifest, null if there is none, or a parse error. */
    manifest: SourcegraphExtension | null | ErrorLike

    /** The raw extension manifest (JSON), or null if there is none.. */
    rawManifest: string | null

    /** The corresponding extension on the registry, if any. */
    registryExtension?: RX
}

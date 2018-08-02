import { ErrorLike } from '../errors'
import * as GQL from '../schema/graphqlschema'

/**
 * A configuration subject is something that can have settings associated with it, such as a site ("global
 * settings"), an organization ("organization settings"), a user ("user settings"), etc.
 */
export type ConfigurationSubject = Pick<GQL.IConfigurationSubject, 'id' | 'settingsURL' | 'viewerCanAdminister'> &
    (
        | Pick<GQL.IUser, '__typename' | 'username' | 'displayName'>
        | Pick<GQL.IOrg, '__typename' | 'name' | 'displayName'>
        | Pick<GQL.ISite, '__typename' | 'siteID'>)

/**
 * A cascade of settings from multiple subjects, from lowest precedence to highest precedence, and the final
 * settings, merged in order of precedence from the settings for each subject in the cascade.
 *
 * @template S the configuration subject type
 * @template C the settings type
 */
export interface ConfigurationCascade<S extends ConfigurationSubject, C> {
    /**
     * The settings for each subject in the cascade, from lowest to highest precedence.
     */
    subjects: ConfiguredSubject<S, C>[]

    /**
     * The final settings (merged in order of precedence from the settings for each subject in the cascade), an
     * error (if any occurred while retrieving, parsing, or merging the settings), or null if there are no settings
     * from any of the subjects.
     */
    merged: C | ErrorLike | null
}

/**
 * A subject and its settings.
 *
 * @template S the configuration subject type
 * @template C the settings type
 */
export interface ConfiguredSubject<S extends ConfigurationSubject, C> {
    /** The subject. */
    subject: S

    /**
     * The subject's settings (if any), an error (if any occurred while retrieving or parsing the settings), or
     * null if there are no settings.
     */
    settings: C | ErrorLike | null
}

/**
 * The conventional ordering of extension configuration subject types in a list.
 */
export const SUBJECT_TYPE_ORDER: GQL.ConfigurationSubject['__typename'][] = ['User', 'Org', 'Site']

export function subjectTypeHeader(nodeType: GQL.ConfigurationSubject['__typename']): string | null {
    switch (nodeType) {
        case 'Site':
            return null
        case 'Org':
            return 'Organization:'
        case 'User':
            return null
        default:
            return null
    }
}

export function subjectLabel(subject: ConfigurationSubject): string {
    switch (subject.__typename) {
        case 'Site':
            return 'Everyone'
        case 'Org':
            return subject.name
        case 'User':
            return subject.username
        default:
            return 'Unknown'
    }
}

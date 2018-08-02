import { ErrorLike } from '../errors'

/**
 * A configuration subject is something that can have settings associated with it, such as a site ("global
 * settings"), an organization ("organization settings"), a user ("user settings"), etc.
 */
export interface ConfigurationSubject {
    /** A unique ID for this subject. */
    id: string
}

/**
 * A cascade of settings from multiple subjects, from lowest precedence to highest precedence, and the final
 * settings, merged in order of precedence from the settings for each subject in the cascade.
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

/** A subject and its settings. */
export interface ConfiguredSubject<S extends ConfigurationSubject, C> {
    /** The subject. */
    subject: S

    /**
     * The subject's settings (if any), an error (if any occurred while retrieving or parsing the settings), or
     * null if there are no settings.
     */
    settings: C | ErrorLike | null
}

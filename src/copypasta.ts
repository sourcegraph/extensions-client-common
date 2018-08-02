// TODO!(sqs)

export interface Settings {
    extensions?: { [extensionID: string]: ExtensionSettings }
}

export interface ExtensionSettings {
    disabled?: boolean
    [key: string]: any
}

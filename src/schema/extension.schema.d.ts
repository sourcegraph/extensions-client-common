/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run json-schema-to-typescript to regenerate this file.
 */

/**
 * The platform targeted by this extension.
 */
export type ExtensionPlatform = BundleTarget | DockerTarget | WebSocketTarget | TcpTarget | ExecTarget;

/**
 * Configuration for a Sourcegraph extension.
 */
export interface SourcegraphExtension {
  /**
   * The title of the extension. If not specified, the extension ID is used.
   */
  title?: string;
  /**
   * The extension's description, which summarizes the extension's purpose and features. It should not exceed a few sentences.
   */
  description?: string;
  /**
   * The extension's README, which should describe (in detail) the extension's purpose, features, and usage instructions. Markdown formatting is supported.
   */
  readme?: string;
  platform: ExtensionPlatform;
  /**
   * A list of events that cause this extension to be activated. '*' means that it will always be activated.
   */
  activationEvents: string[];
  /**
   * Arguments provided to the extension upon initialization (in the `initialize` message's `initializationOptions` field).
   */
  args?: {
    [k: string]: any;
  };
}
/**
 * A JavaScript file that is run as a Web Worker to provide this extension's functionality.
 */
export interface BundleTarget {
  type: "bundle";
  /**
   * The MIME type of the source code. Only "application/javascript" (the default) is supported.
   */
  contentType?: string;
  /**
   * A URL to a file containing the JavaScript source code to execute for this extension.
   */
  url: string;
}
/**
 * A specification of how to run a Docker container to provide this extension's functionality.
 */
export interface DockerTarget {
  type: "docker";
  /**
   * The Docker image to run.
   */
  image: string;
}
/**
 * An existing WebSocket URL endpoint that serves this extension's functionality.
 */
export interface WebSocketTarget {
  type: "websocket";
  /**
   * The WebSocket URL to communicate with.
   */
  url: string;
}
/**
 * An existing TCP server that serves this extension's functionality.
 */
export interface TcpTarget {
  type: "tcp";
  /**
   * The TCP address (`host:port`) of the server to communicate with.
   */
  address: string;
}
/**
 * An local executable to run and communicate with over stdin/stdout to provide this extension's functionality.
 */
export interface ExecTarget {
  type: "exec";
  /**
   * The path to the executable to run.
   */
  command: string;
}

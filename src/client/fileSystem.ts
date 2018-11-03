import { Subscribable } from 'rxjs'
import * as sourcegraph from 'sourcegraph'
import { FileType } from 'sourcegraph'
import { createAggregateError } from '../errors'
import { QueryResult } from '../graphql'
import * as GQL from '../schema/graphqlschema'

/**
 * Returns a {@link module:sourcegraph.FileSystem} that can access files and directories at URIs for extensions by
 * querying the Sourcegraph GraphQL API.
 *
 * @todo Make this more efficient by using a Zip archive.
 * @todo Make this work for repositories that aren't on Sourcegraph by accessing code host APIs directly.
 */
export function getFileSystem(
    uri: string,
    queryGraphQL: (
        query: string,
        vars: { [name: string]: any }
    ) => Subscribable<QueryResult<Pick<GQL.IQuery, 'extensionRegistry' | 'repository'>>>
): sourcegraph.FileSystem {
    // Only supports URLs of the format `git://repo?rev#path`.
    if (!uri.startsWith('git:')) {
        throw new Error(`only git: URIs are supported (got ${JSON.stringify(uri)})`)
    }

    return {
        readDirectory: async uri => {
            const { repo, rev, path } = resolveURI(uri.toString())
            const commit = getCommitData(
                await toPromise(
                    queryGraphQL(
                        `
                        query ReadDirectory($repo: String!, $rev: String!, $path: String!) {
                            repository(name: $repo) {
                                commit(rev: $rev) {
                                    tree(path: $path) {
                                        entries(recursive: false) {
                                            name
                                            isDirectory
                                        }
                                    }
                                }
                            }
                        }
                    `,
                        { repo, rev, path }
                    )
                )
            )
            if (!commit.tree) {
                throw new Error(`path not found: ${path} (in ${repo}@${rev})`)
            }
            return commit.tree.entries.map(
                ({ name, isDirectory }) =>
                    [name, isDirectory ? FileType.Directory : FileType.File] as [string, FileType]
            )
        },
        readFile: async uri => {
            const { repo, rev, path } = resolveURI(uri.toString())
            const commit = getCommitData(
                await toPromise(
                    queryGraphQL(
                        `
                        query ReadFile($repo: String!, $rev: String!, $path: String!) {
                            repository(name: $repo) {
                                commit(rev: $rev) {
                                    blob(path: $path) {
                                        content
                                    }
                                }
                            }
                        }
                    `,
                        { repo, rev, path }
                    )
                )
            )
            if (!commit.blob) {
                throw new Error(`path not found: ${path} (in ${repo}@${rev})`)
            }
            return new TextEncoder().encode(commit.blob.content)
        },
    }
}

function getCommitData({ data, errors }: QueryResult<Pick<GQL.IQuery, 'repository'>>): GQL.IGitCommit {
    if (errors && errors.length > 0) {
        throw createAggregateError(errors)
    }
    if (!data) {
        throw new Error('no data')
    }
    if (!data.repository) {
        throw new Error('repository not found')
    }
    if (!data.repository.commit) {
        throw new Error('commit not found')
    }
    return data.repository.commit
}

/**
 * A resolved URI identifies a path in a repository at a specific revision.
 */
interface ResolvedURI {
    repo: string
    rev: string
    path: string
}

/**
 * Resolve a URI of the forms git://github.com/owner/repo?rev#path and file:///path to an absolute reference, using
 * the given base (root) URI.
 */
function resolveURI(uri: string): ResolvedURI {
    const url = new URL(uri)
    if (url.protocol === 'git:') {
        return {
            repo: (url.host + url.pathname).replace(/^\/*/, '').toLowerCase(),
            rev: url.search.slice(1).toLowerCase(),
            path: url.hash.slice(1),
        }
    }
    throw new Error(`unrecognized URI: ${JSON.stringify(uri)} (supported URI schemes: git)`)
}

function toPromise<T>(sub: Subscribable<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        const unsub = sub.subscribe(
            v => {
                unsub.unsubscribe()
                resolve(v)
            },
            err => {
                unsub.unsubscribe()
                reject(err)
            }
        )
    })
}

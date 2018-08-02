const graphQLContent = Symbol('graphQLContent')
export interface GraphQLDocument {
    [graphQLContent]: string
}

/**
 * Use this template string tag for all GraphQL queries.
 */
export const gql = (template: TemplateStringsArray, ...substitutions: any[]): GraphQLDocument => ({
    [graphQLContent]: String.raw(template, ...substitutions.map(s => s[graphQLContent] || s)),
})

export type GraphQLID = string

/**
 * The response from a GraphQL API query request.
 */
export interface GraphQLResponseRoot<D> {
    data?: D
    errors?: GraphQLResponseError[]
}

export interface GraphQLResponseError {
    message: string
    locations?: GraphQLResponseErrorLocation[]
    [propName: string]: any
}

export interface GraphQLResponseErrorLocation {
    line: number
    column: number
}

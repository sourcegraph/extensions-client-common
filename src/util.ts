import { parse, ParseError, ParseErrorCode } from '@sqs/jsonc-parser'
import { createAggregateError } from './errors'

/**
 * Parses the JSON input using an error-tolerant "jsonc" parser.
 */
export function parseJSON(text: string): any {
    const errors: ParseError[] = []
    const o = parse(text, errors, { allowTrailingComma: true, disallowComments: false })
    if (errors.length > 0) {
        throw createAggregateError(
            errors.map(v => ({
                ...v,
                code: ParseErrorCode[v.error],
                message: `Configuration parse error, code: ${v.error} (offset: ${v.offset}, length: ${v.length})`,
            }))
        )
    }
    return o
}

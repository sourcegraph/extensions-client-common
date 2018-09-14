import * as React from 'react'

interface Props {
    /** The initial value.  */
    value?: boolean

    /** The DOM ID of the element. */
    id?: string

    /**
     * Called when the user changes the input's value.
     */
    onToggle?: (value: boolean) => void

    /** The title attribute (tooltip). */
    title: string

    disabled?: boolean
    tabIndex?: number
    className?: string
}

interface State {
    value: boolean | undefined
}

/** A toggle switch input component. */
export class Toggle extends React.PureComponent<Props, State> {
    public state: State = { value: undefined }

    public render(): JSX.Element | null {
        const value = this.state.value === undefined ? this.props.value : this.state.value

        return (
            <button
                className={`toggle ${this.props.disabled ? 'toggle__disabled' : ''}`}
                id={this.props.id}
                title={this.props.title}
                value={value ? 1 : 0}
                onClick={this.onClick}
                tabIndex={this.props.tabIndex}
            >
                <span
                    className={`toggle__bar ${value ? 'toggle__bar--active' : ''} ${
                        this.props.disabled ? 'toggle__bar--disabled' : ''
                    }`}
                />
                <span
                    className={`toggle__knob ${value ? 'toggle__knob--active' : ''} ${
                        this.props.disabled ? 'toggle__knob--disabled' : ''
                    }`}
                />
            </button>
        )
    }

    private onClick: React.FormEventHandler<HTMLButtonElement> = e => {
        if (this.props.disabled) {
            return
        }

        this.setState(
            ({ value }) => ({ value: !value }),
            () => {
                this.onToggle(this.state.value!)
            }
        )
    }

    private onToggle(value: boolean): void {
        if (value !== !!this.props.value && this.props.onToggle) {
            this.props.onToggle(value)
        }
    }
}

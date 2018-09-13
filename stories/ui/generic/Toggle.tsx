import * as React from 'react'

import { action } from '@storybook/addon-actions'
import { storiesOf } from '@storybook/react'

import { Toggle } from '../../../src/ui/generic/Toggle'

import '../../global.scss'

/**
 * These two imports are separated to prevent auto ordering of imports because we want the globals imported first.
 */
import '../../../src/ui/generic/Toggle.css'

storiesOf('Toggle', module)
    .add('Default true', () => <Toggle onToggle={action('toggled')} title="toggler" value={true} />)
    .add('Default false', () => <Toggle onToggle={action('toggled')} title="toggler" value={false} />)
    .add('Disabled', () => <Toggle onToggle={action('toggled')} disabled={true} title="toggler" />)

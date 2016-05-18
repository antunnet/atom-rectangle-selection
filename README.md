# rectangle-selection package

You can select rectangular areas.

![A screenshot of rectangle-selection package](https://raw.githubusercontent.com/antunnet/atom-rectangle-selection/master/demo.gif)

## Usage

You can select rectangular areas when move cursor with `ctrl-alt-shift`.

## Features

- Supports proportional font and CJK.

## Keymap

To avoid conflict key binding to default atom key binding,
this package maps `ctrl-alt-shift` for select rectangular areas.

If you hope another key binding, edit your keymap file (keymap.cson) like this.

    'atom-text-editor:not([mini])':
      'alt-shift-down' : 'rectangle-selection:select-down'
      'alt-shift-up'   : 'rectangle-selection:select-up'
      'alt-shift-left' : 'rectangle-selection:select-left'
      'alt-shift-right': 'rectangle-selection:select-right'
      'alt-shift-home' : "rectangle-selection:select-to-beginning-Of-line"
      'alt-shift-end'  : "rectangle-selection:select-to-end-of-line"

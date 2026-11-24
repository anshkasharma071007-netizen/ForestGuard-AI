// Multiple light shades share a dark token so existing component styles retain their light palette.
function themedColor(role, light, darkOpacity) {
  return ({ opacityValue, opacityVariable } = {}) => {
    const color = `var(--theme-${role}, ${light})`
    if (!opacityValue || opacityVariable || opacityValue === '1') return color
    const mixed = `color-mix(in srgb, ${color} calc(${opacityValue} * 100%), transparent)`
    return darkOpacity ? `var(--theme-${role}-opaque, ${mixed})` : mixed
  }
}

// Shade positions are stable utility names. Keep new shades at the end of each role.
const lightShades = {
  'control-line': ['#d8d2c2', '#d9d2be', '#dcd6c7', '#ddd6c6', '#ddd7c8', '#ddd8ca', '#ded8c8', '#e0dacb'],
  'danger': ['#7c2d12', '#8b3524', '#8b5a47', '#8c5c49', '#b85c38'],
  'danger-line': ['#e6b9ac', '#eccfc3'],
  'danger-surface': ['#f7e3dd', '#f7e8e2', '#fbf0ec', '#fbf1ec'],
  'hover': ['#efece2', '#f2eee2', '#f4f0e6', '#f6f4ec'],
  'inset': ['#f2eee2', '#f4f0e6', '#e3e9df', '#e6e9df', '#e7ece4', '#eef0ef', '#f1ecdd', '#f1eee5', '#f2ecdc', '#f6f2e4', '#f6f2e6', '#f6f3e9', '#f7f4ea', '#f8f5ec', '#faf7ee', '#faf8f1'],
  'line': ['#e0dacb', '#e3ddcf', '#e9e5d8', '#eae5d8', '#e2ddce', '#e2ddcf', '#e4dfd1', '#e6e0d2', '#e7e1d3', '#e8e3d6', '#e9e4d7', '#eae4d7', '#ece7da', '#eeeadf'],
  'muted': ['#626c61', '#636c62', '#656b64', '#636c62', '#636c62', '#626c62', '#626d5c', '#656c62', '#656b62', '#676b61', '#656b62', '#676b62', '#656b62', '#656b62', '#95a094', '#6b6a5f', '#686b62', '#b3b8ae', '#c1c5bb', '#6d6a5f', '#b4d3bf', '#79b091'],
  'raised': ['#ffffff'],
  'secondary': ['#374038', '#3c4b40', '#435046', '#4b574e', '#4c584e', '#4f5c55', '#596257', '#5f695f', '#606a60', '#626c5f', '#626c61', '#626c61', '#646b64', '#656c5e', '#636c62'],
  'success': ['#245c3b', '#3f6b51', '#4d6a22', '#55735f', '#2f7250', '#4c9069', '#235a3d', '#19452f', '#113021'],
  'success-line': ['#bcd6c2', '#cfdac8', '#cfdcc8', '#b9c9b3', '#c9d6c3'],
  'success-surface': ['#d9e5d3', '#e7f2e9', '#eef6ef', '#eef7db', '#f0f6f2'],
  'warning': ['#6d634b', '#786a4e', '#82601c', '#776a4b', '#916310'],
  'warning-line': ['#e8cf9a', '#f0dfb8'],
  'warning-surface': ['#f8edcf', '#f8eed4', '#fbf4e2'],
}

const themeColors = Object.fromEntries(Object.entries(lightShades).flatMap(([role, shades]) =>
  shades.map((shade, index) => [
    shades.length === 1 ? role : `${role}-${index + 1}`,
    themedColor(role, shade, role === 'raised' || role === 'muted'),
  ]),
))

export default {
  ...themeColors,
  sand: themedColor('canvas', '#f4f1e8'),
  parchment: themedColor('surface', '#fbfaf5'),
  ink: themedColor('ink', '#17211b'),
  'brand-light': '#fbfaf5',
  'soft-risk-low': themedColor('success-surface', '#e4f0e7'),
  'soft-risk-moderate': themedColor('warning-surface', '#f8edcf'),
  'soft-risk-high': themedColor('danger-surface', '#f6dfd8'),
  'soft-risk-low-ink': themedColor('success', '#2f7250'),
  'soft-risk-moderate-ink': themedColor('warning', '#785710'),
  'soft-risk-high-ink': themedColor('danger', '#a53829'),
  'hover-white': themedColor('hover', '#ffffff'),
  action: themedColor('action', '#0c2418'),
  'action-hover': themedColor('action-hover', '#113021'),
  'action-danger': themedColor('action-danger', '#b85c38'),
  'action-danger-hover': themedColor('action-danger-hover', '#a34f30'),
  'ghost-hover': themedColor('hover', '#f0f6f2'),
  focus: themedColor('focus', '#4c9069'),
  'focus-ring': themedColor('focus', '#b4d3bf'),
  'focus-offset': themedColor('focus-offset', '#ffffff'),
}

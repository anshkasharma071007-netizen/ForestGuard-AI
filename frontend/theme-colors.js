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
  'control-line': ['#e3dac6', '#e5dcc9', '#e7dfcd', '#e8e0ce', '#e9e1d0', '#eae2d1', '#ebe3d2', '#ede5d4'],
  'danger': ['#7a2a1e', '#8a3324', '#9a4a38', '#a54e3b', '#b3362a'],
  'danger-line': ['#ebc3b8', '#f0d2c9'],
  'danger-surface': ['#f9e5df', '#f9eae5', '#fcf1ed', '#fcf2ee'],
  'hover': ['#f2ecdd', '#f4eee1', '#f6f0e4', '#f8f3e8'],
  'inset': ['#f5efe1', '#f6f0e3', '#e7ede1', '#e9eee3', '#eaefe5', '#eff2ee', '#f4eddc', '#f3eee4', '#f4eedd', '#f8f3e6', '#f8f3e7', '#f8f5ea', '#f9f6ec', '#faf7ee', '#fbf8f1', '#fcf9f3'],
  'line': ['#e7dfce', '#e9e1d1', '#ede6d7', '#eee7d7', '#e7e0cf', '#e8e1d0', '#e9e2d2', '#ebe4d4', '#ece5d6', '#ede6d8', '#eee7da', '#efe8da', '#f1ebdd', '#f3eee2'],
  'muted': ['#5b6b5e', '#5c6c5f', '#5e6b60', '#5b6b5e', '#5b6b5e', '#5a6a5d', '#5b6c57', '#5e6a5f', '#5e6b5d', '#606a5c', '#5e6b5e', '#606b5e', '#5e6b5e', '#5e6b5e', '#8a968a', '#636a55', '#5f6a5c', '#b9bfaf', '#c6c9b8', '#69654f', '#b6d5b7', '#7fb389'],
  'raised': ['#ffffff'],
  'secondary': ['#33443a', '#384a3e', '#3d5043', '#445849', '#455a4b', '#48604f', '#526657', '#576c5c', '#586e5d', '#5a705f', '#5b715f', '#5b715f', '#5d6b60', '#5f6e59', '#5e6b5e'],
  'success': ['#1e5836', '#2c6a44', '#3a7a33', '#46794f', '#2a7048', '#4c8f5f', '#1f5c3a', '#174a33', '#123d2a'],
  'success-line': ['#c3dcc3', '#d2e0c9', '#d4e2ca', '#bdd3b4', '#ccdcc5'],
  'success-surface': ['#dcebcf', '#e9f4e6', '#eff7ed', '#f0f6dd', '#f0f6e9'],
  'warning': ['#6e5a2e', '#7a6634', '#8a6512', '#7a6a3f', '#946300'],
  'warning-line': ['#edd49b', '#f2e0b6'],
  'warning-surface': ['#faeecb', '#faf0d6', '#fcf5e4'],
}

const themeColors = Object.fromEntries(Object.entries(lightShades).flatMap(([role, shades]) =>
  shades.map((shade, index) => [
    shades.length === 1 ? role : `${role}-${index + 1}`,
    themedColor(role, shade, role === 'raised' || role === 'muted'),
  ]),
))

export default {
  ...themeColors,
  sand: themedColor('canvas', '#faf6ec'),
  parchment: themedColor('surface', '#fffcf5'),
  ink: themedColor('ink', '#17241b'),
  'brand-light': '#fffcf5',
  'soft-risk-low': themedColor('success-surface', '#e6f2e4'),
  'soft-risk-moderate': themedColor('warning-surface', '#faeecb'),
  'soft-risk-high': themedColor('danger-surface', '#f8e2db'),
  'soft-risk-low-ink': themedColor('success', '#2a7048'),
  'soft-risk-moderate-ink': themedColor('warning', '#7a5a10'),
  'soft-risk-high-ink': themedColor('danger', '#a02d23'),
  'hover-white': themedColor('hover', '#ffffff'),
  action: themedColor('action', '#1f5c3a'),
  'action-hover': themedColor('action-hover', '#174a33'),
  'action-danger': themedColor('action-danger', '#b3362a'),
  'action-danger-hover': themedColor('action-danger-hover', '#a02d23'),
  'ghost-hover': themedColor('hover', '#f0f6e9'),
  focus: themedColor('focus', '#2a7048'),
  'focus-ring': themedColor('focus', '#b6d5b7'),
  'focus-offset': themedColor('focus-offset', '#ffffff'),
}
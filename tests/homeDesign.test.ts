/**
 * The browser's stylesheet against the shared design of the home page (`HOME_DESIGN` in the core): the rail of
 * controllers and the column of the selected one. The Ayni app builds its styles from those values.
 */
import { BASE_TEXT, HOME_COLORS as C, HOME_DESIGN as D, TRUST_MARK } from '@ayni.org/ayni-ui-core'
import { describe, expect, it } from 'vitest'
import { css, em, pct, px, role, rule, tint } from './stylesheet.js'

describe('the stylesheet follows the shared base text', () => {
  it('its size and its line height', () => {
    expect(rule('body')['font-size']).toBe(px(BASE_TEXT.fontSize))
    expect(rule('body')['line-height']).toBe(String(BASE_TEXT.lineHeight))
  })
})

describe('the stylesheet follows the shared design of the rail', () => {
  const r = D.rail
  it('the rail', () => {
    expect(css).toContain(`--rail: ${px(r.width)};`)
    const rail = rule('.rail')
    expect(rail.background).toBe(role(C.rail.background))
    expect(rail['border-right']).toBe(`1px solid ${role(C.rail.border)}`)
    expect(rail.padding).toBe(`${px(r.paddingY)} 0`)
    expect(rail.gap).toBe(px(r.gap))
    expect(rule('.rail-zone').gap).toBe(px(r.gap))
  })

  it('a tile, selected, inactive, and the bordered tiles', () => {
    const item = rule('.rail-item')
    expect(item.width).toBe(px(r.tile.size))
    expect(item.height).toBe(px(r.tile.size))
    expect(item['border-radius']).toBe(px(r.tile.radius))
    expect(item.color).toBe(role(C.rail.icon))
    const avatar = rule('.rail-item .avatar')
    expect(avatar.width).toBe(px(r.tile.size))
    expect(avatar['border-radius']).toBe(px(r.tile.radius))
    expect(avatar['font-size']).toBe(px(r.tile.initialsFontSize))
    expect(rule('.avatar')['font-weight']).toBe(String(r.tile.initialsWeight))
    expect(rule('.avatar').background).toBe(role(C.tileInitials.background))
    expect(rule('.avatar').color).toBe(role(C.tileInitials.text))
    expect(rule('.rail-item.inactive').opacity).toBe(String(r.tile.inactiveOpacity))
    const bar = rule('.rail-item.selected::before')
    expect(bar.left).toBe(px(r.selectedBar.left))
    expect(bar.top).toBe(px(r.selectedBar.inset))
    expect(bar.bottom).toBe(px(r.selectedBar.inset))
    expect(bar.width).toBe(px(r.selectedBar.width))
    expect(bar['border-radius']).toBe(px(r.selectedBar.radius))
    expect(bar.background).toBe(role(C.selectedBar.background))
    const ghost = rule('.rail-item.ghost')
    expect(ghost.border).toBe(`${px(r.ghost.borderWidth)} solid ${role(C.ghost.border)}`)
    expect(ghost.background).toBe(role(C.ghost.background))
  })

  it('the badge and the dot of a tile', () => {
    const badge = rule('.badge')
    expect(badge.top).toBe(px(r.badge.top))
    expect(badge.right).toBe(px(r.badge.right))
    expect(badge['min-width']).toBe(px(r.badge.minWidth))
    expect(badge.height).toBe(px(r.badge.height))
    expect(badge.padding).toBe(`0 ${px(r.badge.paddingX)}`)
    expect(badge['border-radius']).toBe(px(r.badge.radius))
    expect(badge['font-size']).toBe(px(r.badge.fontSize))
    expect(badge['font-weight']).toBe(String(r.badge.fontWeight))
    expect(badge.background).toBe(role(C.badge.background))
    const dot = rule('.dot')
    expect(dot.bottom).toBe(px(r.dot.bottom))
    expect(dot.right).toBe(px(r.dot.right))
    expect(dot.width).toBe(px(r.dot.size))
    expect(dot.height).toBe(px(r.dot.size))
    expect(dot.background).toBe(role(C.dot.background))
    expect(dot.border).toBe(`${px(r.dot.borderWidth)} solid ${role(C.dot.border)}`)
  })

  it('the line under the pinned tiles', () => {
    const wrap = rule('.rail-separator-wrap')
    expect(wrap.width).toBe(px(r.separator.width))
    expect(wrap.height).toBe(px(r.separator.height))
    expect(wrap.color).toBe(role(C.separator.pin))
    expect(rule('.rail-separator')['border-top']).toBe(`${px(r.separator.lineWidth)} solid ${role(C.separator.line)}`)
    const pin = rule('.rail-pin')
    expect(pin.background).toBe(role(C.separator.pinBackground))
    expect(pin.padding).toBe(`0 ${px(r.separator.pinPaddingX)}`)
  })
})

describe('the stylesheet follows the shared design of a tile being dragged', () => {
  const r = D.rail
  it('the two zones', () => {
    const zone = rule('.rail-zone')
    expect(zone['min-height']).toBe(px(r.zone.minHeight))
    expect(zone['border-radius']).toBe(px(r.zone.radius))
    const droppable = rule('.rail-zone.droppable')
    expect(droppable.outline).toBe(
      `${px(r.zone.droppableOutlineWidth)} dashed color-mix(in srgb, ${role(C.zone.outline)} ${pct(r.zone.droppableOutlineShare)}, transparent)`
    )
    expect(droppable['outline-offset']).toBe(px(r.zone.outlineOffset))
    expect(rule('.rail-zone.target').outline).toBe(`${px(r.zone.targetOutlineWidth)} solid ${role(C.zone.outline)}`)
    expect(rule('.rail-zone.rail-pinned.droppable')['min-height']).toBe(px(r.zone.droppableMinHeight))
    expect(rule('.rail-separator.target')['border-top-color']).toBe(role(C.separator.target))
    expect(rule('.rail-separator.target + .rail-pin').color).toBe(role(C.separator.target))
  })

  it('the tile where it stood, and the line where it would land', () => {
    const dragging = rule('.rail-item.dragging')
    expect(dragging.opacity).toBe(String(r.drag.opacity))
    expect(dragging.transform).toBe(`scale(${r.drag.scale})`)
    expect(rule('.rail-item.drop-before')['box-shadow']).toBe(
      `0 ${px(-r.drag.dropLineWidth)} 0 0 ${role(C.drag.dropLine)}`
    )
  })
})

describe('the stylesheet follows the shared design of the column', () => {
  const c = D.column
  it('the column and its header', () => {
    expect(css).toContain(`--header: ${px(c.header.height)};`)
    expect(rule('.column').background).toBe(role(C.column.background))
    expect(rule('.column')['border-right']).toBe(`1px solid ${role(C.column.border)}`)
    const header = rule('.column-header')
    expect(header.height).toBe('var(--header)')
    expect(header.padding).toBe(`0 ${px(c.header.paddingRight)} 0 ${px(c.header.paddingLeft)}`)
    expect(header['border-bottom']).toBe(`1px solid ${role(C.column.border)}`)
    const title = rule('.controller-title')
    expect(title.gap).toBe(px(c.header.gap))
    expect(title['font-size']).toBe(px(c.header.fontSize))
    expect(rule('.controller-title svg').color).toBe(role(C.header.icon))
    expect(rule('.flag')['font-size']).toBe(px(c.header.flagFontSize))
  })

  it('an agent card: its row, its logo, its name, its trust mark, its links', () => {
    const row = rule('.agent-row')
    const a = c.agentRow
    expect(row.gap).toBe(px(a.gap))
    expect(row.padding).toBe(`${px(a.paddingTop)} ${px(a.paddingRight)} ${px(a.paddingBottom)} ${px(a.paddingLeft)}`)
    expect(rule('.agent-card')['border-bottom']).toBe(`1px solid ${role(C.column.border)}`)
    expect(rule('.agent-card.selected').background).toBe(role(C.selectedCard.background))
    const avatar = rule('.agent-avatar .avatar')
    expect(avatar.width).toBe(px(c.agentAvatar.size))
    expect(avatar.height).toBe(px(c.agentAvatar.size))
    expect(avatar['border-radius']).toBe(px(c.agentAvatar.radius))
    expect(avatar['font-size']).toBe(px(c.agentAvatar.initialsFontSize))
    expect(rule('.agent-text').gap).toBe(px(c.agentText.gap))
    expect(rule('.agent-title-row').gap).toBe(px(c.agentTitle.gap))
    expect(rule('.agent-toggle')['font-weight']).toBe(String(c.agentTitle.fontWeight))
    const mark = rule('.trust-mark')
    expect(mark.width).toBe(px(c.trustMark.size))
    expect(mark.height).toBe(px(c.trustMark.size))
    expect(mark['border-radius']).toBe(px(c.trustMark.radius))
    for (const [result, { color }] of Object.entries(TRUST_MARK))
      expect(rule(`.trust-mark.${result}`).color).toBe(role(color))
    const links = rule('.agent-links')
    expect(links.gap).toBe(px(c.links.gap))
    expect(links['font-size']).toBe(px(c.links.fontSize))
    expect(links['line-height']).toBe(String(c.links.lineHeight))
    expect(rule('.agent-links a').color).toBe(role(C.links.text))
    const small = rule('.icon-btn.small')
    expect(small.width).toBe(px(c.smallButton.size))
    expect(small.height).toBe(px(c.smallButton.size))
    expect(rule('.icon-btn')['border-radius']).toBe(px(c.smallButton.radius))
  })

  it('the open card: the link state, the tools, the conversations', () => {
    const body = rule('.agent-body')
    expect(body.padding).toBe(`0 ${px(c.body.paddingX)} ${px(c.body.paddingBottom)}`)
    expect(body.gap).toBe(px(c.body.gap))
    expect(rule('.agent-meta').gap).toBe(px(c.meta.gap))
    expect(rule('.agent-meta').padding).toBe(`0 ${px(c.meta.paddingX)}`)
    const state = rule('.agent-meta .state')
    expect(state.gap).toBe(px(c.meta.stateGap))
    expect(state['font-size']).toBe(px(c.meta.fontSize))
    expect(state.color).toBe(role(C.meta.text))
    expect(rule('.agent-tools').gap).toBe(px(c.meta.toolsGap))
    const row = rule('.conv-row')
    const v = c.conversationRow
    expect(row.padding).toBe(`${px(v.paddingY)} ${px(v.paddingRight)} ${px(v.paddingY)} ${px(v.paddingLeft)}`)
    expect(row.gap).toBe(`${px(v.rowGap)} ${px(v.columnGap)}`)
    expect(row['min-height']).toBe(px(v.minHeight))
    expect(rule('.agent-body .conv-row')['border-radius']).toBe(px(v.radius))
    expect(rule('.conv-row.selected').background).toBe(tint('accent', v.selectedTint))
    expect(rule('.conv-row.selected .title').color).toBe(role(C.conversationRow.selectedTitle))
    expect(rule('.conv-row .title')['font-weight']).toBe(String(v.titleWeight))
    expect(rule('.conv-row .preview')['font-size']).toBe(px(v.previewFontSize))
    expect(rule('.conv-row .preview').color).toBe(role(C.conversationRow.preview))
    expect(rule('.conv-row .time')['font-size']).toBe(px(v.timeFontSize))
    expect(rule('.conv-row .time').color).toBe(role(C.conversationRow.time))
    for (const selector of ['.conv-row .count', '.agent-toggle .count']) {
      const count = rule(selector)
      expect(count.background).toBe(role(C.count.background))
      expect(count.color).toBe(role(C.count.text))
      expect(count['border-radius']).toBe(px(c.count.radius))
      expect(count['font-size']).toBe(px(c.count.fontSize))
      expect(count.padding).toBe(`${px(c.count.paddingY)} ${px(c.count.paddingX)}`)
    }
    const label = rule('.section-label')
    expect(label['font-size']).toBe(px(c.sectionLabel.fontSize))
    expect(label['letter-spacing']).toBe(em(c.sectionLabel.letterSpacing))
    expect(label.color).toBe(role(C.sectionLabel.text))
    const inCard = rule('.agent-body .section-label')
    expect(inCard.gap).toBe(px(c.sectionLabel.gap))
    expect(inCard.padding).toBe(`${px(c.sectionLabel.paddingTop)} ${px(c.sectionLabel.paddingX)} 0`)
    const empty = rule('.agent-body .empty')
    expect(empty['font-size']).toBe(px(c.empty.fontSize))
    expect(empty.padding).toBe(`${px(c.empty.paddingY)} ${px(c.empty.paddingX)}`)
  })
})

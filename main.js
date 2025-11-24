const { Plugin, ItemView, TFile } = require('obsidian')

const VIEW_TYPE = 'tree-view-panel'

class TreeViewView extends ItemView {
  constructor(leaf) {
    super(leaf)
    this.state = { showForwards: true, showBacklinks: true, displayMode: 'none', search: '', root: null, expanded: new Map() }
    this._refreshScheduled = false
  }
  getViewType() { return VIEW_TYPE }
  getDisplayText() { return 'Tree View' }
  onOpen() {
    this.containerEl.empty()
    const wrap = this.containerEl.createDiv({ cls: 'tree-view-wrap' })
    const header = wrap.createDiv({ cls: 'tree-view-header' })
    const leftGroup = header.createDiv({ cls: 'tree-view-left' })
    const title = leftGroup.createEl('div', { text: 'Tree View', cls: 'tree-view-title' })
    const rightGroup = header.createDiv({ cls: 'tree-view-right' })
    const forwardBtn = rightGroup.createEl('button', { text: '→', cls: 'tree-view-btn' })
    const backBtn = rightGroup.createEl('button', { text: '←', cls: 'tree-view-btn' })
    const dotsBtn = rightGroup.createEl('button', { text: '⋯', cls: 'tree-view-btn' })
    const searchInput = rightGroup.createEl('input', { type: 'text', placeholder: 'Filter path…', cls: 'tree-view-search' })
    const body = wrap.createDiv({ cls: 'tree-view-body' })
    this.el = { wrap, header, leftGroup, title, rightGroup, forwardBtn, backBtn, dotsBtn, searchInput, body }
    forwardBtn.addEventListener('click', () => { this.state.showForwards = !this.state.showForwards; this.updateHeaderButtons(); this.render() })
    backBtn.addEventListener('click', () => { this.state.showBacklinks = !this.state.showBacklinks; this.updateHeaderButtons(); this.render() })
    dotsBtn.addEventListener('click', () => { this.toggleDisplayModeMenu(dotsBtn) })
    searchInput.addEventListener('input', () => { this.state.search = searchInput.value.trim(); this.render() })
    this.registerEvent(this.app.workspace.on('file-open', () => this.setRootFromActive()))
    this.registerEvent(this.app.metadataCache.on('resolved', () => this.scheduleRender()))
    this.setRootFromActive()
    this.updateHeaderButtons()
  }
  onClose() {}
  updateHeaderButtons() {
    if (!this.el) return
    const { forwardBtn, backBtn } = this.el
    if (!forwardBtn || !backBtn) return
    forwardBtn.classList.toggle('is-on', this.state.showForwards)
    forwardBtn.classList.toggle('is-off', !this.state.showForwards)
    backBtn.classList.toggle('is-on', this.state.showBacklinks)
    backBtn.classList.toggle('is-off', !this.state.showBacklinks)
  }
  toggleDisplayModeMenu(anchor) {
    const menu = document.createElement('div')
    menu.className = 'tree-view-menu'
    const mk = (label, mode) => {
      const b = document.createElement('button')
      b.textContent = label
      b.className = 'tree-view-menu-item'
      b.addEventListener('click', () => { this.state.displayMode = mode; menu.remove(); this.render() })
      return b
    }
    menu.appendChild(mk('无文本', 'none'))
    menu.appendChild(mk('单行文本', 'single'))
    menu.appendChild(mk('全文', 'full'))
    const rect = anchor.getBoundingClientRect()
    menu.style.position = 'fixed'
    menu.style.top = `${rect.bottom + 4}px`
    menu.style.left = `${rect.right - 160}px`
    document.body.appendChild(menu)
    const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', close) } }
    document.addEventListener('mousedown', close)
  }
  setRootFromActive() {
    const file = this.app.workspace.getActiveFile()
    if (!file || !(file instanceof TFile)) { this.state.root = null; this.render(); return }
    this.state.root = file
    if (!this.state.expanded.has(file.path)) this.state.expanded.set(file.path, true)
    this.render()
  }
  scheduleRender() {
    if (this._refreshScheduled) return
    this._refreshScheduled = true
    requestAnimationFrame(() => { this._refreshScheduled = false; this.render() })
  }
  async render() {
    const body = this.el.body
    body.empty()
    const root = this.state.root
    if (!root) { body.createDiv({ text: '打开一个笔记以查看链接树' }); return }
    if (this.state.showForwards) {
      const outSec = body.createDiv({ cls: 'tree-view-section' })
      outSec.createEl('div', { cls: 'tree-view-section-title', text: 'Outlinks →' })
      const outTree = outSec.createDiv({ cls: 'tree-view-tree' })
      await this.renderNode(outTree, root, 0, new Set([root.path]), 'forward')
    }
    if (this.state.showBacklinks) {
      const inSec = body.createDiv({ cls: 'tree-view-section' })
      inSec.createEl('div', { cls: 'tree-view-section-title', text: 'Inlinks ←' })
      const inTree = inSec.createDiv({ cls: 'tree-view-tree' })
      await this.renderNode(inTree, root, 0, new Set([root.path]), 'back')
    }
  }
  getForwardLinks(file) {
    const cache = this.app.metadataCache.getFileCache(file)
    const out = new Set()
    if (cache && cache.links) {
      for (const l of cache.links) {
        const dest = this.app.metadataCache.getFirstLinkpathDest(l.link, file.path)
        if (dest && dest instanceof TFile) out.add(dest.path)
      }
    }
    if (cache && cache.embeds) {
      for (const l of cache.embeds) {
        const dest = this.app.metadataCache.getFirstLinkpathDest(l.link, file.path)
        if (dest && dest instanceof TFile) out.add(dest.path)
      }
    }
    return Array.from(out)
  }
  getBacklinks(file) {
    const rl = this.app.metadataCache.resolvedLinks
    const res = []
    for (const [src, targets] of Object.entries(rl)) {
      if (targets && targets[file.path]) res.push(src)
    }
    return res
  }
  getFileByPath(path) {
    const af = this.app.vault.getAbstractFileByPath(path)
    if (af && af instanceof TFile) return af
    return null
  }
  createRow(container, depth, expanded) {
    const row = container.createDiv({ cls: 'tree-view-row' })
    row.style.paddingLeft = `${depth * 16}px`
    const bullet = row.createEl('span', { text: expanded ? '▾' : '▸', cls: 'tree-view-bullet' })
    const name = row.createEl('span', { cls: 'tree-view-name' })
    const open = row.createEl('span', { cls: 'tree-view-open', text: '↗' })
    const meta = row.createDiv({ cls: 'tree-view-meta' })
    const children = container.createDiv({ cls: 'tree-view-children' })
    return { row, bullet, name, open, meta, children }
  }
  async renderNode(container, file, depth, visited, mode) {
    const path = file.path
    const expanded = this.state.expanded.get(path) === true
    const { row, bullet, name, open, meta, children } = this.createRow(container, depth, expanded)
    bullet.addEventListener('click', (e) => { e.stopPropagation(); const now = this.state.expanded.get(path) === true; this.state.expanded.set(path, !now); this.render() })
    name.textContent = file.basename || file.name
    name.classList.add('is-link')
    if (this.state.displayMode !== 'none' && expanded) {
      const contentWrap = container.createDiv({ cls: 'tree-view-content' })
      const text = await this.app.vault.read(file)
      if (this.state.displayMode === 'single') {
        const first = (text.split(/\r?\n/)[0] || '')
        const input = contentWrap.createEl('input', { type: 'text', value: first, cls: 'tree-view-input' })
        input.addEventListener('keydown', async (e) => { if (e.key === 'Enter') { const lines = text.split(/\r?\n/); lines[0] = input.value; await this.app.vault.modify(file, lines.join('\n')) } })
        input.addEventListener('blur', async () => { const lines = text.split(/\r?\n/); lines[0] = input.value; await this.app.vault.modify(file, lines.join('\n')) })
      } else if (this.state.displayMode === 'full') {
        const ta = contentWrap.createEl('textarea', { cls: 'tree-view-textarea' })
        ta.value = text
        ta.addEventListener('blur', async () => { await this.app.vault.modify(file, ta.value) })
      }
    }
    const showF = this.state.showForwards
    const showB = this.state.showBacklinks
    const searchQ = this.state.search
    const forwardPaths = this.getForwardLinks(file)
    const backPaths = this.getBacklinks(file)
    meta.empty()
    const fb = meta.createEl('span', { cls: 'tree-view-badge forward', text: `→ ${forwardPaths.length}` })
    const bb = meta.createEl('span', { cls: 'tree-view-badge back', text: `← ${backPaths.length}` })
    open.addEventListener('click', (e) => { e.stopPropagation(); this.app.workspace.openLinkText(path, '', false) })
    row.addEventListener('click', () => { const now = this.state.expanded.get(path) === true; this.state.expanded.set(path, !now); this.render() })
    if (!expanded) return
    const childPaths = []
    if (mode === 'forward') { for (const p of forwardPaths) childPaths.push({ p, type: 'forward' }) }
    else if (mode === 'back') { for (const p of backPaths) childPaths.push({ p, type: 'back' }) }
    const seen = new Set()
    for (const { p } of childPaths) { if (!visited.has(p)) seen.add(p) }
    const filtered = []
    for (const p of Array.from(seen)) {
      if (searchQ) { if (p.toLowerCase().includes(searchQ.toLowerCase())) filtered.push(p) } else filtered.push(p)
    }
    for (const p of filtered) {
      const f = this.getFileByPath(p)
      if (f) {
        const v2 = new Set(Array.from(visited)); v2.add(p)
        await this.renderNode(children, f, depth + 1, v2, mode)
      }
    }
  }
}

class TreeViewPlugin extends Plugin {
  async onload() {
    this.registerView(VIEW_TYPE, leaf => new TreeViewView(leaf))
    this.app.workspace.onLayoutReady(async () => {
      if (this.app.workspace.getLeavesOfType(VIEW_TYPE).length === 0) {
        let leaf = this.app.workspace.getRightLeaf ? this.app.workspace.getRightLeaf(true) : null
        if (!leaf) leaf = this.app.workspace.getLeaf(true)
        await leaf.setViewState({ type: VIEW_TYPE, active: true })
      }
    })
  }
  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE)
  }
}

module.exports = TreeViewPlugin

/* global getComputedStyle */
import React, { Fragment } from 'react'
import { findDOMNode } from 'react-dom'
import PropTypes from 'prop-types'
import { connect } from 'redux-bundler-react'
import { Trans, withTranslation } from 'react-i18next'
import classnames from 'classnames'
import { join } from 'path'
import { sorts } from '../../bundles/files'
import { filesToStreams } from '../../lib/files'
import { List, WindowScroller, AutoSizer } from 'react-virtualized'
// Reac DnD
import { NativeTypes } from 'react-dnd-html5-backend'
import { DropTarget } from 'react-dnd'
// Components
import Checkbox from '../../components/checkbox/Checkbox'
import SelectedActions from '../selected-actions/SelectedActions'
import File from '../file/File'
import LoadingAnimation from '../../components/loading-animation/LoadingAnimation'

export class FilesList extends React.Component {
  constructor (props) {
    super(props)
    this.listRef = React.createRef()
  }

  static propTypes = {
    className: PropTypes.string,
    files: PropTypes.array.isRequired,
    filesSorting: PropTypes.shape({
      by: PropTypes.string.isRequired,
      asc: PropTypes.bool.isRequired
    }),
    updateSorting: PropTypes.func.isRequired,
    root: PropTypes.string.isRequired,
    downloadProgress: PropTypes.number,
    filesIsFetching: PropTypes.bool,
    filesPathInfo: PropTypes.object,
    // React Drag'n'Drop
    isOver: PropTypes.bool.isRequired,
    canDrop: PropTypes.bool.isRequired,
    connectDropTarget: PropTypes.func.isRequired,
    // Actions
    onShare: PropTypes.func.isRequired,
    onInspect: PropTypes.func.isRequired,
    onDownload: PropTypes.func.isRequired,
    onDelete: PropTypes.func.isRequired,
    onRename: PropTypes.func.isRequired,
    onNavigate: PropTypes.func.isRequired,
    onAddFiles: PropTypes.func.isRequired,
    onMove: PropTypes.func.isRequired,
    // From i18next
    t: PropTypes.func.isRequired,
    tReady: PropTypes.bool.isRequired
  }

  static defaultProps = {
    className: ''
  }

  state = {
    selected: [],
    focused: null,
    isDragging: false
  }

  filesRefs = {}

  get selectedFiles () {
    return this.state.selected.map(name =>
      this.props.files.find(el => el.name === name)
    ).filter(n => n)
  }

  get focusedFile () {
    return this.props.files.find(el => el.name === this.state.focused)
  }

  get selectedMenu () {
    if (this.state.selected.length === 0) {
      return null
    }

    const unselectAll = () => this.toggleAll(false)
    const size = this.selectedFiles.reduce((a, b) => a + (b.size || 0), 0)

    // We need this to get the width in ems
    const innerWidthEm = window.innerWidth / parseFloat(getComputedStyle(document.querySelector('body'))['font-size'])

    return (
      <SelectedActions
        className={'fixed bottom-0 right-0'}
        style={{
          maxWidth: innerWidthEm < 60 ? '100%' : `calc(100% - ${this.props.navbarWidth}px)`,
          zIndex: 20
        }}
        animateOnStart
        unselect={unselectAll}
        remove={() => this.props.onDelete(this.selectedFiles)}
        rename={() => this.props.onRename(this.selectedFiles)}
        share={() => this.props.onShare(this.selectedFiles)}
        download={() => this.props.onDownload(this.selectedFiles)}
        inspect={() => this.props.onInspect(this.selectedFiles[0].hash)}
        count={this.state.selected.length}
        isMfs={this.props.filesPathInfo.isMfs}
        downloadProgress={this.props.downloadProgress}
        size={size} />
    )
  }

  componentDidMount () {
    document.addEventListener('keydown', this.keyHandler)
  }

  componentWillUnmount () {
    document.removeEventListener('keydown', this.keyHandler)
  }

  componentDidUpdate () {
    const selected = this.state.selected.filter(name => (
      this.props.files.find(el => el.name === name)
    ))

    if (selected.length !== this.state.selected.length) {
      this.setState({ selected })
    }
  }

  keyHandler = (e) => {
    const { files, filesIsFetching } = this.props
    const { selected, focused } = this.state

    // Disable keyboard controls if fetching files
    if (filesIsFetching) {
      return
    }

    if (e.key === 'Escape') {
      this.setState({ selected: [], focused: null })
      return this.listRef.current.forceUpdateGrid()
    }

    if (e.key === 'F2' && focused !== null) {
      return this.props.onRename([this.focusedFile])
    }

    if (e.key === 'Delete' && selected.length > 0) {
      return this.props.onDelete(this.selectedFiles)
    }

    if (e.key === ' ' && focused !== null) {
      e.preventDefault()
      return this.toggleOne(focused, true)
    }

    if ((e.key === 'Enter' || (e.key === 'ArrowRight' && e.metaKey)) && focused !== null) {
      return this.props.onNavigate(this.focusedFile.path)
    }

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopImmediatePropagation()

      if (focused === null) return

      const prev = files.findIndex(el => el.name === focused)
      const index = (e.key === 'ArrowDown') ? prev + 1 : prev - 1

      const hasReachedTopOfList = index === -1
      const hasReachedBottomOfList = index === files.length

      if (hasReachedTopOfList || hasReachedBottomOfList) return

      const name = files[index].name

      const domNode = findDOMNode(this.filesRefs[name])
      domNode.scrollIntoView({ block: 'center', behavior: 'smooth' })
      domNode.querySelector('button').focus()
      this.setState({ focused: name })

      this.listRef.current.forceUpdateGrid()
    }
  }

  toggleAll = (checked) => {
    let selected = []

    if (checked) {
      selected = this.props.files.map(file => file.name)
    }

    this.setState({ selected: selected })
    this.listRef.current.forceUpdateGrid()
  }

  toggleOne = (name, check) => {
    const selected = this.state.selected
    const index = selected.indexOf(name)

    if (check && index < 0) {
      selected.push(name)
    } else if (index >= 0) {
      selected.splice(this.state.selected.indexOf(name), 1)
    }

    this.setState({ selected: selected.sort() })
    this.listRef.current.forceUpdateGrid()
  }

  move = (src, dst) => {
    const selected = this.selectedFiles

    if (selected.length > 0) {
      const parts = dst.split('/')
      parts.pop()
      let basepath = parts.join('/')

      if (basepath === '') {
        basepath = '/'
      }

      const toMove = selected.map(({ name, path }) => ([
        path,
        join(basepath, name)
      ]))

      const res = toMove.find(a => a[0] === src)
      if (!res) {
        toMove.push([src, dst])
      }

      this.toggleAll(false)
      toMove.forEach(op => this.props.onMove(...op))
    } else {
      this.props.onMove(src, dst)
    }
  }

  sortByIcon = (order) => {
    if (this.props.filesSorting.by === order) {
      return this.props.filesSorting.asc ? '↑' : '↓'
    }

    return null
  }

  changeSort = (order) => () => {
    const { filesSorting, updateSorting } = this.props

    if (order === filesSorting.by) {
      updateSorting(order, !filesSorting.asc)
    } else {
      updateSorting(order, true)
    }

    this.listRef.current.forceUpdateGrid()
  }

  isDragging = (is = true) => {
    this.setState({ isDragging: is })
  }

  onFileFocused = ({ name }) => this.setState({ focused: name })

  emptyRowsRenderer = () => {
    const { t } = this.props
    return (
      <Trans i18nKey='filesList.noFiles' t={t}>
        <div className='pv3 b--light-gray bt tc gray f6'>
            There are no available files. Add some!
        </div>
      </Trans>
    )
  }

  rowRenderer = ({ index, key, style }) => {
    const { files, pins, filesPathInfo, isOver, canDrop, onNavigate, onInspect, onAddFiles } = this.props
    const { selected, isDragging } = this.state

    return (
      <div key={key} style={style}>
        <File
          {...files[index]}
          pinned={pins.includes(files[index].hash)}
          ref={r => { this.filesRefs[files[index].name] = r }}
          isMfs={filesPathInfo.isMfs}
          name={files[index].name}
          onSelect={this.toggleOne}
          onFocus={this.onFileFocused}
          onNavigate={() => {
            if (files[index].type === 'unknown') {
              onInspect(files[index].hash)
            } else {
              onNavigate(files[index].path)
            }
          }}
          onAddFiles={onAddFiles}
          onMove={this.move}
          selected={selected.indexOf(files[index].name) !== -1}
          setIsDragging={this.isDragging}
          handleContextMenuClick={this.props.handleContextMenuClick}
          translucent={isDragging || (isOver && canDrop)} />
      </div>
    )
  }

  render () {
    let { t, files, className, showLoadingAnimation, connectDropTarget } = this.props
    const { selected } = this.state
    const allSelected = selected.length !== 0 && selected.length === files.length
    const checkBoxCls = classnames({
      'o-1': allSelected,
      'o-70': !allSelected
    }, ['pl2 w2 glow'])

    className = `FilesList no-select sans-serif border-box w-100 flex flex-column ${className}`

    return connectDropTarget(
      <section ref={(el) => { this.root = el }} className={className}>
        { showLoadingAnimation
          ? <LoadingAnimation />
          : <Fragment>
            <header className='gray pv3 flex items-center flex-none' style={{ paddingRight: '1px', paddingLeft: '1px' }}>
              <div className={checkBoxCls}>
                <Checkbox checked={allSelected} onChange={this.toggleAll} aria-label={t('selectAllEntries')}/>
              </div>
              <div className='ph2 f6 flex-auto'>
                <button aria-label={ t('sortBy', { name: t('itemName') })} onClick={this.changeSort(sorts.BY_NAME)}>
                  {t('itemName')} {this.sortByIcon(sorts.BY_NAME)}
                </button>
              </div>
              <div className='ph2 pv1 flex-none dn db-l tr mw3'>
                { /* Badges */ }
              </div>
              <div className='pl2 pr4 tr f6 flex-none dn db-l mw4 w-10'>
                <button aria-label={ t('sortBy', { name: t('size') })} onClick={this.changeSort(sorts.BY_SIZE)}>
                  {t('size')} {this.sortByIcon(sorts.BY_SIZE)}
                </button>
              </div>
              <div className='pa2' style={{ width: '2.5rem' }} />
            </header>
            <WindowScroller>
              {({ height, isScrolling, onChildScroll, scrollTop }) => (
                <div className='flex-auto'>
                  <AutoSizer disableHeight>
                    {({ width }) => (
                      <List
                        ref={this.listRef}
                        autoHeight
                        width={width}
                        height={height}
                        className='outline-0'
                        aria-label={ t('filesListLabel')}
                        rowCount={files.length}
                        rowHeight={55}
                        rowRenderer={this.rowRenderer}
                        noRowsRenderer={this.emptyRowsRenderer}
                        onRowsRendered={this.onRowsRendered}
                        isScrolling={isScrolling}
                        onScroll={onChildScroll}
                        scrollTop={scrollTop}
                        data={files /* NOTE: this is a placebo prop to force the list to re-render */} />
                    )}
                  </AutoSizer>
                </div>
              )}
            </WindowScroller>
            {this.selectedMenu}
          </Fragment> }
      </section>
    )
  }
}

const dropTarget = {
  drop: ({ onAddFiles }, monitor) => {
    if (monitor.didDrop()) {
      return
    }
    const { filesPromise } = monitor.getItem()

    const add = async () => {
      const files = await filesPromise
      onAddFiles(await filesToStreams(files))
    }

    add()
  },
  canDrop: props => props.filesPathInfo.isMfs
}

const dropCollect = (connect, monitor) => ({
  connectDropTarget: connect.dropTarget(),
  isOver: monitor.isOver(),
  canDrop: monitor.canDrop()
})

export const FilesListWithDropTarget = DropTarget(NativeTypes.FILE, dropTarget, dropCollect)(withTranslation('files')(FilesList))

export default connect(
  'selectNavbarWidth',
  'selectPins',
  'selectFilesIsFetching',
  'selectFilesSorting',
  'selectFilesPathInfo',
  'selectShowLoadingAnimation',
  FilesListWithDropTarget
)

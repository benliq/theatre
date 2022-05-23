import React from 'react'
import styled from 'styled-components'
import {panelZIndexes} from '@theatre/studio/panels/BasePanel/common'
import ProjectsList from './ProjectsList/ProjectsList'
import {pointerEventsAutoInNormalMode} from '@theatre/studio/css'
import {useVal} from '@theatre/react'
import getStudio from '@theatre/studio/getStudio'
import useHotspot from '@theatre/studio/uiComponents/useHotspot'

const headerHeight = `44px`

const Container = styled.div<{pin: boolean}>`
  background-color: transparent;
  position: absolute;
  left: 8px;
  z-index: ${panelZIndexes.outlinePanel};
  ${pointerEventsAutoInNormalMode};
  top: calc(${headerHeight} + 8px);
  height: fit-content;
  max-height: calc(100% - ${headerHeight});
  overflow-y: scroll;
  overflow-x: hidden;
  padding: 0;
  user-select: none;

  &::-webkit-scrollbar {
    display: none;
  }

  scrollbar-width: none;

  display: ${({pin}) => (pin ? 'block' : 'none')};

  &:hover {
    display: block;
  }

  // Create a small buffer on the bottom to aid selecting the bottom item in a long, scrolling list
  &::after {
    content: '';
    display: block;
    height: 20px;
  }
`

const OutlinePanel: React.FC<{}> = (props) => {
  const pin = useVal(getStudio().atomP.ahistoric.pinOutline)
  const active = useHotspot('left')

  return (
    <Container pin={pin || active}>
      <ProjectsList />
    </Container>
  )
}

export default OutlinePanel

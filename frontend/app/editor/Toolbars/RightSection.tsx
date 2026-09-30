import React, { useState } from 'react'
import TileMenu from '../TileMenu'
import { SpecialTile } from '@/utils/pixi/types'
import SpecialTiles from '../SpecialTiles'
import { SheetName } from '@/utils/pixi/spritesheet/spritesheet'
import { TileWithPalette } from '../Editor'
import type { RealmData } from '@/utils/pixi/types'
import OfficeObjectsPanel from '../OfficeObjectsPanel'

type RightSectionProps = {
    realmData: RealmData
    selectedTile: TileWithPalette
    setSelectedTile: (tile: TileWithPalette) => void
    selectSpecialTile: (specialTile: SpecialTile) => void
    specialTile: SpecialTile
    rooms: string[]
    setRooms: (rooms: string[]) => void
    roomIndex: number
    setRoomIndex: (index: number) => void
    palettes: SheetName[]
    selectedPalette: SheetName
    setSelectedPalette: (palette: SheetName) => void
}

type Tab = 'Tile' | 'Special Tiles' | 'Objects'

const RightSection:React.FC<RightSectionProps> = ({ realmData, selectedTile, setSelectedTile, specialTile, selectSpecialTile, rooms, setRooms, roomIndex, setRoomIndex, palettes, selectedPalette, setSelectedPalette }) => {
    
    const [tab, setTab] = useState<Tab>('Tile')

    return (
        <div className='w-[400px] bg-secondary flex flex-col select-none'>
            <div className='flex flex-row h-10 px-2 pt-[4px]'>
                <button type="button"
                    className={`grow hover:bg-darkblue animate-colors rounded-t-md cursor-pointer grid place-items-center select-none ${tab === 'Tile' ? 'pointer-events-none bg-light-secondary' : 'bg-secondary'}`}
                    onClick={() => setTab('Tile')}
                >
                    Tiles
                </button>
                <button type="button"
                    className={`grow hover:bg-darkblue animate-colors rounded-t-md cursor-pointer grid place-items-center select-none ${tab === 'Special Tiles' ? 'pointer-events-none bg-light-secondary' : 'bg-secondary'}`}
                    onClick={() => setTab('Special Tiles')}
                >
                    Special Tiles
                </button>
                <button type="button" className={`grow rounded-t-md ${tab === 'Objects' ? 'bg-light-secondary' : 'bg-secondary hover:bg-darkblue'}`} onClick={() => setTab('Objects')}>Objetos</button>
            </div>
            <div className='bg-light-secondary h-[4px]'/>
        <div>
                {tab === 'Tile' && (
                    <TileMenu 
                        selectedTile={selectedTile} 
                        setSelectedTile={setSelectedTile} 
                        rooms={rooms}
                        setRooms={setRooms}
                        roomIndex={roomIndex}
                        setRoomIndex={setRoomIndex}
                        palettes={palettes}
                        selectedPalette={selectedPalette}
                        setSelectedPalette={setSelectedPalette}
                    />
                )}
                {tab === 'Special Tiles' && <SpecialTiles specialTile={specialTile} selectSpecialTile={selectSpecialTile}/>}
                {tab === 'Objects' && <OfficeObjectsPanel realmData={realmData} roomIndex={roomIndex} />}
            </div>
        </div>
    )
}

export default RightSection

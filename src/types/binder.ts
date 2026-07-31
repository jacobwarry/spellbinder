export type ContainerType = 'binder' | 'box'

export interface BaseContainer {
  id: string
  name: string
  type: ContainerType
  hasCoverImage?: boolean
  // Decorative colors used when there's no cover image (outside) or on the
  // spread's inside covers (inside). Concrete hex so they persist independent of
  // theme. Both optional — absent falls back to the placeholder chrome.
  outsideColor?: string
  insideColor?: string
}

export interface PhysicalBinder extends BaseContainer {
  type: 'binder'
  pageCount: number
  slotsPerPage: number
}

// How a box orders its cards for display. 'added' = placement/insertion order
// (the default, i.e. segment order then card order); 'name'/'number' sort the
// box's cards alphabetically or by collector number. Sorting is display-only —
// it never reorders segment cardIds, so ownership keys stay intact.
export type BoxSortMode = 'added' | 'name' | 'number'

export interface StorageBox extends BaseContainer {
  type: 'box'
  // No capacity field - boxes are unlimited
  sortMode?: BoxSortMode  // undefined = 'added'
}

export type Container = PhysicalBinder | StorageBox

// Legacy alias for backward compatibility
export type Binder = Container

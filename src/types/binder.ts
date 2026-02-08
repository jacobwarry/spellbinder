export type ContainerType = 'binder' | 'box'

export interface BaseContainer {
  id: string
  name: string
  type: ContainerType
  hasCoverImage?: boolean
}

export interface PhysicalBinder extends BaseContainer {
  type: 'binder'
  pageCount: number
  slotsPerPage: number
}

export interface StorageBox extends BaseContainer {
  type: 'box'
  // No capacity field - boxes are unlimited
}

export type Container = PhysicalBinder | StorageBox

// Legacy alias for backward compatibility
export type Binder = Container

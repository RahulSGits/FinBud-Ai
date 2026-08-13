// The new-agent route renders the same builder as the edit route, and the
// builder blocks on the provider's voice and model catalogues before it can
// draw its selects. Without a skeleton that wait is a blank column.
//
// Deliberately identical to the edit route's skeleton: the two pages render the
// same component, so two different loading shapes would make navigating between
// them look like a layout change rather than a page change.
export { default } from '../[id]/loading';

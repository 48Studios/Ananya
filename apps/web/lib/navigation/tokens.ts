export const NAV_TOKENS = {
  // Shared Header Height across Rail, Sidebar, and Top App Bar (56px)
  HEADER_HEIGHT: 'h-14 min-h-[56px]',

  // Widths
  RAIL_WIDTH: 'w-[60px] min-w-[60px]',
  SIDEBAR_EXPANDED_WIDTH: 'w-[280px] min-w-[280px]',
  SIDEBAR_COLLAPSED_WIDTH: 'w-[72px] min-w-[72px]',

  // Row Heights (Unified 36px row height for top-level and nested items alike)
  ITEM_HEIGHT_TOP_LEVEL: 'h-9', // 36px
  ITEM_HEIGHT_CHILD: 'h-9',     // 36px

  // Spacing & Gaps
  TOP_ITEM_GAP: 'space-y-1',   // 4px vertical gap
  CHILD_ITEM_GAP: 'space-y-1', // 4px gap

  // Indentation Hierarchy (Reduced by 8-10px for desktop density)
  LEVEL_1_PADDING: 'px-3',
  LEVEL_2_PADDING: 'pl-4.5 pr-3', // Reduced from pl-7 to pl-4.5
  LEVEL_3_PADDING: 'pl-7 pr-3',   // Reduced from pl-9 to pl-7

  // Tree Guide Line
  TREE_GUIDE_LINE: 'ml-3.5 pl-2 border-l border-sidebar-border/40',

  // Section Dividers
  SECTION_DIVIDER: 'pt-2.5 mt-2.5 border-t border-sidebar-border/50',
} as const

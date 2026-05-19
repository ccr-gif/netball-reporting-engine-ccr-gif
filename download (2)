// src/theme.ts
export const palette = {
  primary:   '#0a84ff',
  success:   '#30d158',
  danger:    '#ff453a',
  warning:   '#ffd60a',
  purple:    '#bf5af2',
  teamBlue:  '#082D80',
  redStat:   '#BA3856',
} as const;

export type Theme = {
  colors: {
    primary: string;
    success: string;
    danger: string;
    warning: string;
    bg: string;
    card: string;
    cardBorder: string;
    text: string;
    textSecondary: string;
    muted: string;
    inputBg: string;
    inputBorder: string;
    navBg: string;
    navBorder: string;
    headerBg: string;
    tabActive: string;
    pillBg: string;
    pillText: string;
    scoreBg: string;
    liveIndicator: string;
    offlineBg: string;
    offlineText: string;
  };
  dark: boolean;
};

export const lightTheme: Theme = {
  dark: false,
  colors: {
    primary:       palette.primary,
    success:       palette.success,
    danger:        palette.danger,
    warning:       palette.warning,
    bg:            '#f8fafc',
    card:          '#ffffff',
    cardBorder:    '#e2e8f0',
    text:          '#0f172a',
    textSecondary: '#334155',
    muted:         '#64748b',
    inputBg:       '#ffffff',
    inputBorder:   '#e2e8f0',
    navBg:         '#ffffff',
    navBorder:     '#e2e8f0',
    headerBg:      '#ffffff',
    tabActive:     '#e0f2fe',
    pillBg:        '#0ea5e9',
    pillText:      '#001018',
    scoreBg:       '#f1f5f9',
    liveIndicator: '#ef4444',
    offlineBg:     '#fef3c7',
    offlineText:   '#92400e',
  },
};

export const darkTheme: Theme = {
  dark: true,
  colors: {
    primary:       palette.primary,
    success:       palette.success,
    danger:        palette.danger,
    warning:       palette.warning,
    bg:            '#0b1120',
    card:          '#141e30',
    cardBorder:    '#1e2d42',
    text:          '#e2e8f0',
    textSecondary: '#94a3b8',
    muted:         '#64748b',
    inputBg:       '#1a2540',
    inputBorder:   '#1e2d42',
    navBg:         '#0f172a',
    navBorder:     '#1e2d42',
    headerBg:      '#0f172a',
    tabActive:     '#1e3a5f',
    pillBg:        '#0369a1',
    pillText:      '#e0f2fe',
    scoreBg:       '#1a2540',
    liveIndicator: '#ef4444',
    offlineBg:     '#422006',
    offlineText:   '#fde68a',
  },
};

// Legacy export for components not yet migrated
export const colors = palette;

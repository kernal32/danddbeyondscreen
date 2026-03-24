import { createContext, useContext, type ReactNode } from 'react';
import type { TableTheme } from '@ddb/shared-types';

const TableThemeContext = createContext<TableTheme>('minimal');

export function TableThemeProvider({
  theme,
  children,
}: {
  theme: TableTheme;
  children: ReactNode;
}) {
  return <TableThemeContext.Provider value={theme}>{children}</TableThemeContext.Provider>;
}

export function useTableTheme(): TableTheme {
  return useContext(TableThemeContext);
}

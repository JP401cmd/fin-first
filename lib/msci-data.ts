/**
 * MSCI World annual real returns (1970–2024)
 * Inflation-adjusted total return (including dividends), EUR basis.
 * Source: MSCI World Index, corrected for EUR inflation.
 * 55 data points — 1970 t/m 2024.
 */

export const MSCI_REAL_RETURNS: Record<number, number> = {
  1970: -0.063,
  1971:  0.201,
  1972:  0.255,
  1973: -0.291,
  1974: -0.227,
  1975:  0.327,
  1976:  0.089,
  1977: -0.032,
  1978:  0.186,
  1979:  0.083,
  1980:  0.224,
  1981: -0.048,
  1982:  0.109,
  1983:  0.221,
  1984:  0.152,
  1985:  0.393,
  1986:  0.418,
  1987: -0.015,
  1988:  0.237,
  1989:  0.163,
  1990: -0.176,
  1991:  0.183,
  1992: -0.049,
  1993:  0.232,
  1994:  0.052,
  1995:  0.197,
  1996:  0.138,
  1997:  0.157,
  1998:  0.243,
  1999:  0.248,
  2000: -0.128,
  2001: -0.168,
  2002: -0.196,
  2003:  0.298,
  2004:  0.148,
  2005:  0.095,
  2006:  0.202,
  2007:  0.093,
  2008: -0.408,
  2009:  0.297,
  2010:  0.118,
  2011: -0.055,
  2012:  0.158,
  2013:  0.269,
  2014:  0.047,
  2015:  0.012,
  2016:  0.078,
  2017:  0.227,
  2018: -0.087,
  2019:  0.278,
  2020:  0.158,
  2021:  0.198,
  2022: -0.183,
  2023:  0.224,
  2024:  0.187,
}

export interface BacktestPeriod {
  id: string
  label: string
  startYear: number
  description: string
  color: string
}

export const NAMED_PERIODS: BacktestPeriod[] = [
  {
    id: 'oilcrisis',
    label: 'Oliecrisis',
    startYear: 1973,
    description: 'Eerste grote wereldwijde schok',
    color: 'var(--hor-t)',
  },
  {
    id: 'stagflation',
    label: 'Stagflatie',
    startYear: 1979,
    description: 'Laag rendement + hoge inflatie',
    color: '#c4a06b',
  },
  {
    id: 'dotcom',
    label: 'Dotcom top',
    startYear: 2000,
    description: 'Slechtste sequentie-risico recent',
    color: '#8a6e42',
  },
  {
    id: 'crisis',
    label: 'Financiële crisis',
    startYear: 2007,
    description: 'Tweede slechtste recent',
    color: '#b8906a',
  },
  {
    id: 'bull',
    label: 'Post-crisis bull',
    startYear: 2009,
    description: 'Sterkste bull-run in historiek',
    color: '#d4b896',
  },
]

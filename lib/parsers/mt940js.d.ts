declare module 'mt940js' {
  interface MT940Transaction {
    date: Date
    amount: number
    details: string
    transactionType: string
  }

  interface MT940Statement {
    transactions: MT940Transaction[]
    accountId: string
    number: string
    openingBalance: number
    closingBalance: number
  }

  class MT940 {
    parse(data: string): MT940Statement[]
  }

  export default MT940
}

// Lojas do Xmenu. Os códigos NÃO são segredos; os tokens ficam nas variáveis de ambiente (Vercel).

export type LojaXmenu = {
  chave: string;
  storeId: string; // código da loja no Xmenu
  nome: string;
  variavelToken: string; // nome da variável de ambiente que guarda o token desta loja
};

export const LOJAS_XMENU: LojaXmenu[] = [
  { chave: "pg", storeId: "20210", nome: "BlackPoke Praia Grande", variavelToken: "XMENU_TOKEN_PG" },
  { chave: "santos", storeId: "20211", nome: "BlackPoke Santos", variavelToken: "XMENU_TOKEN_SANTOS" },
  { chave: "miyagi", storeId: "20773", nome: "Seu Miyagi Sushi", variavelToken: "XMENU_TOKEN_MIYAGI" },
  { chave: "abc", storeId: "22010", nome: "BlackPoke ABC", variavelToken: "XMENU_TOKEN_ABC" },
];

export const VARIAVEL_URL_XMENU = "XMENU_API_URL";

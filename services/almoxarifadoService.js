const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const serviceAccountAuth = new JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID, serviceAccountAuth);

exports.getEstoqueData = async () => {
    await doc.loadInfo(); 
    
    // 1. Aba: ESTOQUE MDF, FITAS, E TAPA FUROS (Índice 1)
    const abaMdf = doc.sheetsByIndex[1];
    await abaMdf.loadCells('A1:K41'); 

    const mdf = [];
    // O loop varre as colunas B até K (índices 1 a 10 no código)
    for (let col = 1; col <= 10; col++) {
        // Ignora a coluna C (índice 2) e E (índice 4)
        if (col === 2 || col === 4) continue;

        const insumo = abaMdf.getCell(0, col).value; // Linha 1 (B1:K1)
        const valorUnitario = abaMdf.getCell(40, col).value; // Linha 41 (B41:K41)

        if (insumo) {
            // O loop varre as linhas de cores da linha 2 até a 39 (índices 1 a 38)
            for (let row = 1; row <= 38; row++) {
                const cor = abaMdf.getCell(row, 0).value; // Coluna A (A2:A39)
                const quantidade = abaMdf.getCell(row, col).value; // Valor em estoque

                // Só adiciona se tiver quantidade no estoque
                if (cor && quantidade && quantidade > 0) {
                    mdf.push({
                        insumo: insumo,
                        cor: cor,
                        quantidade: quantidade,
                        valorUnitario: valorUnitario || 0
                    });
                }
            }
        }
    }

    // Função auxiliar para as abas mais simples (Ferragens, Limpeza, EPIs)
    const extrairDadosAbaPadrao = async (indiceAba) => {
        const aba = doc.sheetsByIndex[indiceAba];
        const linhas = await aba.getRows();
        
        return linhas.map(row => ({
            insumo: row.get('INSUMO') || row._rawData[0],
            medida: row.get('MEDIDA') || row._rawData[1],
            quantidade: row.get('QUANTIDADE') || row._rawData[2],
            // Se for EPI's (índice 6) pega da coluna D (índice 3), se não pega da E (índice 4)
            valorUnitario: indiceAba === 6 ? row._rawData[3] : row._rawData[4] 
        })).filter(item => item.insumo); // Remove linhas em branco
    };

    // 2. Aba: FERRAGENS (Índice 4)
    const ferragens = await extrairDadosAbaPadrao(4);

    // 3. Aba: LIMPEZA (Índice 5)
    const limpeza = await extrairDadosAbaPadrao(5);

    // 4. Aba: EPI'S (Índice 6)
    const epis = await extrairDadosAbaPadrao(6);

    return { mdf, ferragens, limpeza, epis };
};
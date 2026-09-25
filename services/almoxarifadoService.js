const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

exports.getEstoqueData = async () => {
    // Formatação segura para o Vercel: remove aspas indesejadas e garante a quebra de linha real
    let privateKey = process.env.GOOGLE_PRIVATE_KEY || '';
    privateKey = privateKey.replace(/\\n/g, '\n').replace(/(^"|"$)/g, '');

    const serviceAccountAuth = new JWT({
        email: process.env.GOOGLE_CLIENT_EMAIL,
        key: privateKey,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID, serviceAccountAuth);
    
    await doc.loadInfo(); 
    
    // 1. Aba: ESTOQUE MDF, FITAS, E TAPA FUROS (Índice 1)
    const abaMdf = doc.sheetsByIndex[1];
    await abaMdf.loadCells('A1:K41'); 

    const mdf = [];
    for (let col = 1; col <= 10; col++) {
        // Ignora a coluna C (índice 2) e E (índice 4)
        if (col === 2 || col === 4) continue;

        const insumo = abaMdf.getCell(0, col).value; 
        const valorUnitario = abaMdf.getCell(40, col).value; 

        if (insumo) {
            for (let row = 1; row <= 38; row++) {
                const cor = abaMdf.getCell(row, 0).value; 
                const quantidade = abaMdf.getCell(row, col).value; 

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

    // Função auxiliar para Ferragens, Limpeza e EPIs
    const extrairDadosAbaPadrao = async (indiceAba) => {
        const aba = doc.sheetsByIndex[indiceAba];
        const linhas = await aba.getRows();
        
        return linhas.map(row => ({
            insumo: row.get('INSUMO') || row._rawData[0],
            medida: row.get('MEDIDA') || row._rawData[1],
            quantidade: row.get('QUANTIDADE') || row._rawData[2],
            valorUnitario: indiceAba === 6 ? row._rawData[3] : row._rawData[4] 
        })).filter(item => item.insumo);
    };

    const ferragens = await extrairDadosAbaPadrao(4);
    const limpeza = await extrairDadosAbaPadrao(5);
    const epis = await extrairDadosAbaPadrao(6);

    return { mdf, ferragens, limpeza, epis };
};
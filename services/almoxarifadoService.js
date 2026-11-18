const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

exports.getEstoqueData = async () => {
    // Formatação segura para o Vercel
    let privateKey = process.env.GOOGLE_PRIVATE_KEY || '';
    privateKey = privateKey.replace(/\\n/g, '\n').replace(/(^"|"$)/g, '');

    const serviceAccountAuth = new JWT({
        email: process.env.GOOGLE_CLIENT_EMAIL,
        key: privateKey,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID, serviceAccountAuth);
    await doc.loadInfo();

    // Filtra apenas as abas visíveis
    const abasVisiveis = doc.sheetsByIndex.filter(aba => !aba.hidden);

    const abaMdfSede = abasVisiveis[1];
    const abaMdfRegional = abasVisiveis[2];
    const abaMdfUpfem = abasVisiveis[3];
    const abaFerragens = abasVisiveis[4];
    const abaLimpeza = abasVisiveis[5];
    const abaEpis = abasVisiveis[6];
    const abaMaquinario = abasVisiveis[9];

    // --- FUNÇÃO AUXILIAR DINÂMICA PARA MDF E FITAS ---
    const extrairDadosMdf = async (aba, local) => {
        if (!aba) return [];

        const totalLinhas = aba.rowCount;
        const totalColunas = aba.columnCount;

        // Carrega todas as células utilizadas na aba
        await aba.loadCells({
            startRowIndex: 0,
            endRowIndex: totalLinhas,
            startColumnIndex: 0,
            endColumnIndex: totalColunas
        });

        // 1. Descobre dinamicamente qual linha representa o "VALOR" na coluna A (índice 0)
        let linhaValor = -1;
        for (let row = 1; row < totalLinhas; row++) {
            const textoColunaA = String(aba.getCell(row, 0).value || '').trim().toUpperCase();
            if (textoColunaA === 'VALOR') {
                linhaValor = row;
                break;
            }
        }

        const itensMdf = [];

        // 2. Percorre as colunas de insumos (a partir da coluna B / índice 1)
        for (let col = 1; col < totalColunas; col++) {
            const insumoRaw = aba.getCell(0, col).value;
            const insumo = insumoRaw ? String(insumoRaw).trim() : '';

            // Ignora colunas vazias, colunas divisorias ou colunas de totalização
            if (!insumo || insumo.toUpperCase() === 'TOTAL') continue;

            // Busca o valor unitário na linha encontrada com o nome "VALOR"
            const valorUnitario = linhaValor !== -1 ? (aba.getCell(linhaValor, col).value || 0) : 0;

            // 3. Percorre as linhas de cores
            for (let row = 1; row < totalLinhas; row++) {
                const corRaw = aba.getCell(row, 0).value;
                const cor = corRaw ? String(corRaw).trim() : '';
                const corUpper = cor.toUpperCase();

                // Desconsidera linhas vazias, a linha "TOTAL" e a própria linha "VALOR"
                if (!cor || corUpper === 'TOTAL' || corUpper === 'VALOR') continue;

                const qtdRaw = aba.getCell(row, col).value;
                const quantidade = typeof qtdRaw === 'number'
                    ? qtdRaw
                    : parseFloat(String(qtdRaw || '0').replace(',', '.')) || 0;

                if (quantidade > 0) {
                    itensMdf.push({
                        insumo,
                        cor,
                        quantidade,
                        valorUnitario,
                        local
                    });
                }
            }
        }

        return itensMdf;
    };

    // Extrai e unifica os dados das três unidades
    const mdf = [
        ...(await extrairDadosMdf(abaMdfSede, 'Sede')),
        ...(await extrairDadosMdf(abaMdfRegional, 'Regional')),
        ...(await extrairDadosMdf(abaMdfUpfem, 'Upfem'))
    ];

    // --- FUNÇÃO AUXILIAR ABAS PADRÃO ---
    const extrairDadosAbaPadrao = async (aba, isEpi) => {
        if (!aba) return [];
        const linhas = await aba.getRows();
        return linhas.map(row => ({
            insumo: row.get('INSUMO') || row._rawData[0],
            medida: row.get('MEDIDA') || row._rawData[1],
            quantidade: row.get('QUANTIDADE') || row._rawData[2],
            valorUnitario: isEpi ? (row._rawData[3]) : (row._rawData[4])
        })).filter(item => item.insumo);
    };

    const ferragens = await extrairDadosAbaPadrao(abaFerragens, false);
    const limpeza = await extrairDadosAbaPadrao(abaLimpeza, false);
    const epis = await extrairDadosAbaPadrao(abaEpis, true);

    // --- MAQUINÁRIO ---
    const maquinario = [];
    if (abaMaquinario) {
        const linhasMaq = await abaMaquinario.getRows();
        const maqMap = {};

        linhasMaq.forEach(row => {
            const maquina = (row.get('MÁQUINA') || row.get('MAQUINA') || row._rawData[0] || '').trim();
            const marca = (row.get('MARCA') || row._rawData[1] || 'S/Marca').trim();
            const quantidade = parseFloat(row.get('QUANTIDADE') || row._rawData[2]) || 0;
            const status = (row.get('STATUS') || row._rawData[3] || 'Sem Status').trim();

            if (maquina && quantidade > 0) {
                const key = `${maquina}|${marca}|${status}`;
                if (maqMap[key]) {
                    maqMap[key].quantidade += quantidade;
                } else {
                    maqMap[key] = { maquina, marca, quantidade, status };
                }
            }
        });
        maquinario.push(...Object.values(maqMap));
    }

    return { mdf, ferragens, limpeza, epis, maquinario };
};
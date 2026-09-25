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

    // O SEGREDO ESTÁ AQUI: Filtramos o array para pegar apenas as abas visíveis
    const abasVisiveis = doc.sheetsByIndex.filter(aba => !aba.hidden);

    // Agora os índices funcionam baseados puramente no que você vê na tela
    const abaMdfSede = abasVisiveis[1];
    const abaMdfRegional = abasVisiveis[2];
    const abaMdfUpfem = abasVisiveis[3];
    const abaFerragens = abasVisiveis[4];
    const abaLimpeza = abasVisiveis[5];
    const abaEpis = abasVisiveis[6];
    const abaMaquinario = abasVisiveis[7];

    const mdf = [];

    // --- 1. MDF SEDE ---
    if (abaMdfSede) {
        await abaMdfSede.loadCells('A1:K41'); 
        for (let col = 1; col <= 10; col++) {
            if (col === 2 || col === 4) continue;
            const insumo = abaMdfSede.getCell(0, col).value; 
            const valorUnitario = abaMdfSede.getCell(40, col).value; 
            if (insumo) {
                for (let row = 1; row <= 38; row++) {
                    const cor = abaMdfSede.getCell(row, 0).value; 
                    const quantidade = abaMdfSede.getCell(row, col).value; 
                    if (cor && quantidade && quantidade > 0) {
                        mdf.push({ insumo, cor, quantidade, valorUnitario: valorUnitario || 0, local: 'Sede' });
                    }
                }
            }
        }
    }

    // --- 2. MDF REGIONAL ---
    if (abaMdfRegional) {
        await abaMdfRegional.loadCells('A1:K13'); 
        for (let col = 1; col <= 10; col++) {
            if (col === 2 || col === 4) continue;
            const insumo = abaMdfRegional.getCell(0, col).value; 
            const valorUnitario = abaMdfRegional.getCell(12, col).value; 
            if (insumo) {
                for (let row = 1; row <= 10; row++) {
                    const cor = abaMdfRegional.getCell(row, 0).value; 
                    const quantidade = abaMdfRegional.getCell(row, col).value; 
                    if (cor && quantidade && quantidade > 0) {
                        mdf.push({ insumo, cor, quantidade, valorUnitario: valorUnitario || 0, local: 'Regional' });
                    }
                }
            }
        }
    }

    // --- 3. MDF UPFEM ---
    if (abaMdfUpfem) {
        await abaMdfUpfem.loadCells('A1:I5'); 
        for (let col = 1; col <= 8; col++) {
            const insumo = abaMdfUpfem.getCell(0, col).value; 
            const valorUnitario = abaMdfUpfem.getCell(4, col).value; 
            if (insumo) {
                for (let row = 1; row <= 2; row++) {
                    const cor = abaMdfUpfem.getCell(row, 0).value; 
                    const quantidade = abaMdfUpfem.getCell(row, col).value; 
                    if (cor && quantidade && quantidade > 0) {
                        mdf.push({ insumo, cor, quantidade, valorUnitario: valorUnitario || 0, local: 'Upfem' });
                    }
                }
            }
        }
    }

    // --- Função Auxiliar ---
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

    // --- 4. MAQUINÁRIO ---
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
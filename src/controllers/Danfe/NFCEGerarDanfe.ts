/*
 * This file is part of NFeWizard-io.
 * 
 * NFeWizard-io is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * NFeWizard-io is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with NFeWizard-io. If not, see <https://www.gnu.org/licenses/>.
 */
import bwipjs from 'bwip-js';
import path from 'path';
import fs from 'fs';
import { ICMS, IPI, DetProd, NFEGerarDanfeProps, Ide, Dest, Emit, Total, Transp, InfAdic, Vol, ProtNFe, Pag, InfNFeSupl } from '@Protocols';
import { format, parseISO } from 'date-fns';
import ValidaCPFCNPJ from '@Utils/ValidaCPFCNPJ';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { fileURLToPath } from 'url';


const baseDir = path.dirname(fileURLToPath(import.meta.url))
const fontDir = process.env.NODE_ENV === 'production' ? 'assets/fonts/ARIAL.TTF' : '../../assets/fonts/ARIAL.TTF';
const fontDirBold = process.env.NODE_ENV === 'production' ? 'assets/fonts/ARIALBD.TTF' : '../../assets/fonts/ARIALBD.TTF';


class NFCEGerarDanfe {
    data: NFEGerarDanfeProps['data'];
    chave: string;
    enviada: boolean;
    outputPath: string
    qrcodePath: string;
    documento: ValidaCPFCNPJ;
    protNFe: ProtNFe | undefined;
    det: DetProd | DetProd[];
    ide: Ide;
    dest: Dest | undefined;
    emit: Emit;
    total: Total;
    transp: Transp;
    pag: Pag;
    infAdic: InfAdic | undefined;
    infNFeSupl: InfNFeSupl | undefined
    exibirMarcaDaguaDanfe?: boolean;
    fontSize: number;
    larguraPadrao: number;
    documentWidth: number;
    itemHeight: number;
    doc: InstanceType<typeof PDFDocument>;

    constructor(props: NFEGerarDanfeProps) {
        const { data, chave, outputPath, pageWidth } = props;

        this.data = data;
        this.chave = chave.trim();
        this.outputPath = outputPath;
        this.enviada = false; // Valor padrão
        this.qrcodePath = './src/assets'; // Caminho padrão
        if (process.env.NODE_ENV === 'production') {
            this.qrcodePath = 'assets'; // Caminho padrão
        }
        this.documento = new ValidaCPFCNPJ(); // Inicialização correta
        this.protNFe = data.protNFe;

        const nfeData = Array.isArray(data.NFe) ? data.NFe[0] : data.NFe;
        const { det, ide, emit, dest, total, transp, pag, infAdic } = nfeData.infNFe;
        const infNFeSupl = nfeData.infNFeSupl;

        this.det = det;
        this.ide = ide;
        this.emit = emit;
        this.total = total;
        this.transp = transp;
        this.pag = pag;
        this.infAdic = infAdic;
        this.infNFeSupl = infNFeSupl;
        if (dest) this.dest = dest;

        if (this.protNFe?.infProt.nProt) {
            this.enviada = true;
        }

        function calculateHeight(itemsLength: number, itemHeight: number) {
            const headerHeight = 34.22975675056; // Altura do cabeçalho
            const footerHeight = 170; // Altura do rodapé -> 34.22975675056

            // Altura total é a soma das alturas dos itens + cabeçalho + rodapé
            return headerHeight + footerHeight + (itemsLength * itemHeight) + 5;
        }

        function calculateFontSize(width: number) {
            // Aqui você pode ajustar a fórmula para atender às suas necessidades
            return Math.min(width) * 0.02646;
        }

        this.larguraPadrao = 226.772;
        this.documentWidth = pageWidth || 226.772; // 158.74
        // const pageHeight = 300;
        let itensLength = 1;
        if (this.det instanceof Array) {
            itensLength = this.det.length;
        }

        const fontSize = calculateFontSize(this.documentWidth);
        this.fontSize = fontSize;

        this.itemHeight = fontSize * 1.116;
        const pageHeight = calculateHeight(itensLength, this.itemHeight);

        const fontPath = path.resolve(baseDir, fontDir);
        const fontPathBold = path.resolve(baseDir, fontDirBold);

        this.doc = new PDFDocument({
            margins: { top: 5.67, right: 5.67, bottom: 5.67, left: 5.67 },
            size: [this.documentWidth, pageHeight],
            bufferPages: true,
            layout: 'portrait',
        });
        this.doc.registerFont('Arial', fontPath)
        this.doc.registerFont('Arial-bold', fontPathBold)
    }

    saveQRCode = async (text: string) => {
        // Caminho para salvar o QR code na pasta src/assets
        const filePath = path.join(this.qrcodePath, 'qrcode.png');
        this.createDir(this.qrcodePath);

        try {
            await QRCode.toFile(filePath, text, {
                color: {
                    dark: '#000000', // Cor do código
                    light: '#FFFFFF', // Cor de fundo
                },
                width: 300, // Largura da imagem
            });
        } catch (error) {
            console.error('Erro ao gerar o QR code:', error);
        }
    };

    createDir(path: string) {
        if (!fs.existsSync(path)) {
            fs.mkdirSync(path, { recursive: true });
        }
    }

    async generateBarcode(data: string) {
        try {
            const png = await bwipjs.toBuffer({
                bcid: 'code128',       // Tipo de código de barras
                text: data,            // Dado a ser codificado
                scaleX: 4,             // Fator de escala
                height: 14,            // Altura da barra
                includetext: false,    // Incluir texto
            });
            const barcode = png.toString('base64');
            const barcodeDir = this.qrcodePath;
            const barcodeFilePath = path.join(barcodeDir, 'barcode.png');
            this.createDir(barcodeDir);
            fs.writeFileSync(barcodeFilePath, Buffer.from(barcode, 'base64'));
        } catch (err) {
            console.error('Erro ao gerar código de barras:', err);
            return null;
        }
    }

    centeredPos(texto: string) {
        const larguraPagina = this.doc.page.width;
        const larguraTexto = this.doc.fontSize(this.fontSize).widthOfString(texto);
        const posicaoX = (larguraPagina - larguraTexto) / 2;
        return posicaoX;
    }

    ajustarPosicao(posicaoOriginal: number, novaLargura: number) {
        return posicaoOriginal * (novaLargura / this.larguraPadrao);
    }

    calculaPosicao(text: string) {
        const { right, left } = this.doc.page.margins;
        const [pageWidth] = this.doc.page.size;

        const textWidth = this.doc.widthOfString(text);
        return Number(pageWidth) - textWidth - right - left;
    }

    drawHeader(isFirstPage: boolean) {
        this._buildHeader();
    }

    drawFooter() {
        this._buildFooter();
    }

    _buildHeader() {
        const CNPJCPF = this.emit.CNPJCPF?.toString() 
        const CNPJ = this.emit.CNPJ?.toString() 
        const CPF = this.emit.CPF?.toString()
        const documento = this.documento.mascaraCnpjCpf(CNPJCPF || CNPJ || CPF || '')

        const identificationJoined = `${this.emit.enderEmit.xLgr}, ${this.emit.enderEmit.nro}, ${this.emit.enderEmit.xBairro}, ${this.emit.enderEmit.UF}`

        /** IDENTIFICACAO EMITENTE */
        const _buildIdentificacaoEmit = () => {
            const centeredPosEmit = this.centeredPos(`CNPJ: ${documento} ${this.emit.xNome}`)
            const centeredPosEnd = this.centeredPos(identificationJoined)
            const centeredPosText = this.centeredPos('Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica')

            this.doc.font('Arial').fontSize(this.fontSize).text(`CNPJ: ${documento} `, centeredPosEmit, 2, {
                lineBreak: false,
            })
                .font('Arial-bold').text(this.emit.xNome)
                .fontSize(this.fontSize)
                .font('Arial')
                .text(identificationJoined, centeredPosEnd)
                .text('Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica', centeredPosText)
        }

        _buildIdentificacaoEmit();
    }

    _buildProdutos() {
        const tableTop = this.doc.y + 5;
        let y = tableTop;
        let currentPage = 0;

        const header = (top: number) => {
            this.doc.font('Arial-bold').fontSize(this.fontSize).text('Código', 2, top);
            this.doc.text('Descrição', this.ajustarPosicao(30, this.documentWidth), top);
            this.doc.text('Qtde UN', this.ajustarPosicao(136.77, this.documentWidth), top);
            this.doc.text('VL Unit', this.ajustarPosicao(166.77, this.documentWidth), top);
            this.doc.text('VL Total', this.ajustarPosicao(196.77, this.documentWidth), top);
        };

        const row = (top: number, item: DetProd) => {
            const quant = parseFloat(String(item.prod.qCom || item.prod.qTrib)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
            const valUnit = parseFloat(String(item.prod.vUnCom || item.prod.vUnTrib || '0')).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const valLiq = parseFloat(String(item.prod.vProd || '0')).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });


            this.doc.font('Arial').fontSize(this.fontSize).text(item.prod.cProd, 2, top);
            this.doc.text(item.prod.xProd.slice(0, 30), this.ajustarPosicao(30, this.documentWidth), top);
            this.doc.text(`${quant} ${item.prod.uCom}`, this.ajustarPosicao(135, this.documentWidth), top, {
                width: this.ajustarPosicao(25, this.documentWidth),
                align: 'right'
            });
            this.doc.text(valUnit, this.ajustarPosicao(166.77, this.documentWidth), top, {
                width: this.ajustarPosicao(20, this.documentWidth),
                align: 'right'
            });
            this.doc.text(valLiq, this.ajustarPosicao(196.77, this.documentWidth), top, {
                width: this.ajustarPosicao(20, this.documentWidth),
                align: 'right'
            });

        };

        header(tableTop);

        const createTable = (prod: DetProd) => {
            row(y + this.itemHeight, prod);
            y += this.itemHeight;
            currentPage++;
        }

        // // Adicionando itens da tabela
        if (this.det instanceof Array) {
            for (let i = 0; i < this.det.length; i++) {
                const prod = this.det[i];
                createTable(prod);
            }
        } else {
            createTable(this.det);
        }
    }

    _buildTotais() {

        let tableTop = this.doc.y + 5;

        const quantidadeTotalDeItens = Array.isArray(this.det) ? this.det.length : 1;

        let valTotal = 0;
        let acrescimo = 0;
        let desconto = 0;

        if (Array.isArray(this.det)) {
            // Calcula o valor total dos produtos
            valTotal = this.det.reduce((sum, item) => sum + parseFloat(item.prod.vProd), 0);

            // Calcula o total dos acréscimos
            acrescimo = this.det.reduce((sum, item) =>
                sum + (parseFloat(item.prod.vFrete || '0') + parseFloat(item.prod.vSeg || '0') + parseFloat(item.prod.vOutro || '0')), 0
            );

            // Calcula o total dos descontos
            desconto = this.det.reduce((sum, item) => sum + parseFloat(item.prod.vDesc || '0'), 0);
        } else {
            // Calcula o valor total do produto, os acréscimos, e desconto caso não seja um array
            valTotal = parseFloat(this.det.prod.vProd);
            acrescimo = parseFloat(this.det.prod.vFrete || '0') + parseFloat(this.det.prod.vSeg || '0') + parseFloat(this.det.prod.vOutro || '0');
            desconto = parseFloat(this.det.prod.vDesc || '0')
        }
        const valorTotal = valTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })
        const acrescimoTotal = acrescimo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })
        const descontoTotal = desconto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })

        this.doc.text('Qtd. total de itens', 2, tableTop);
        this.doc.text(String(quantidadeTotalDeItens), this.calculaPosicao(String(quantidadeTotalDeItens)), tableTop, {
            align: 'right',
        });
        tableTop += this.itemHeight;

        this.doc.text('Valor total R$', 2, tableTop);
        this.doc.text(valorTotal, this.calculaPosicao(valorTotal), tableTop, {
            align: 'right',
        });

        tableTop += this.itemHeight;

        if (desconto > 0) {
            this.doc.text('Desconto R$', 2, tableTop);
            this.doc.text(descontoTotal, this.calculaPosicao(descontoTotal), tableTop, {
                align: 'right',
            });
            tableTop += this.itemHeight;
        }
        if (acrescimo > 0) {
            this.doc.text('Acréscimo R$', 2, tableTop);
            this.doc.text(acrescimoTotal, this.calculaPosicao(acrescimoTotal), tableTop, {
                align: 'right',
            });
            tableTop += this.itemHeight;
        }

        if (desconto > 0 || acrescimo > 0) {
            const totalPagar = parseFloat(String(valTotal + acrescimo - desconto)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 });

            this.doc.font('Arial-bold').text('Valor a Pagar R$', 2, tableTop);
            this.doc.text(totalPagar, this.calculaPosicao(totalPagar), tableTop, {
                align: 'right',
            });
        }

        tableTop += this.itemHeight + 2;

        this.doc.font('Arial').text('FORMA PAGAMENTO', 2, tableTop);

        // Tipos

        let topTiposPag = tableTop;
        if (Array.isArray(this.pag.detPag)) {
            for (let pagto of this.pag.detPag) {
                this.doc.text(pagto.xPag || 'Não informado', 2, topTiposPag + this.itemHeight);
                topTiposPag += this.itemHeight;
            }
        } else {
            this.doc.text(this.pag.detPag.xPag || 'Não informado', 2, topTiposPag + this.itemHeight);
        }

        this.doc.text('VALOR PAGO R$', this.calculaPosicao('VALOR PAGO R$'), tableTop, {
            align: 'right',
        });

        // Valores
        let topValPags = tableTop;
        if (Array.isArray(this.pag.detPag)) {
            for (let pagto of this.pag.detPag) {
                const val = parseFloat(pagto.vPag).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })
                this.doc.text(val, this.calculaPosicao(val), topValPags + this.itemHeight, {
                    align: 'right',
                });
                topValPags += this.itemHeight;
            }
        } else {
            const val = parseFloat(this.pag.detPag.vPag).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })
            this.doc.text(val, this.calculaPosicao(val), topValPags + this.itemHeight, {
                align: 'right',
            });
        }

        tableTop = topValPags;
        tableTop += 2 * this.itemHeight;

        let valTroco = 0;
        if (Array.isArray(this.pag.detPag)) {
            valTroco = this.pag.detPag.reduce((sum, item) => sum + parseFloat(item.vTroco || '0'), 0);
        } else {
            valTroco = parseFloat(this.pag.detPag.vTroco || '0');
        }

        const troco = valTroco.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })

        this.doc.text('Troco R$', 2, tableTop);
        this.doc.text(troco, this.calculaPosicao(troco), tableTop, {
            align: 'right',
        });

    }

    _buildFooter() {
        let tableTop = this.doc.y + 5;

        this.doc.font('Arial-bold').text('Consulte pela Chave de Acesso em', 0, tableTop, {
            align: 'center'
        });
        tableTop += this.itemHeight;

        this.doc.font('Arial').text(this.infNFeSupl?.urlChave || '', 0, tableTop, {
            align: 'center'
        });
        tableTop += this.itemHeight;

        this.doc.text(this.protNFe?.infProt.chNFe || '', 0, tableTop, {
            align: 'center'
        });

        tableTop += this.itemHeight;
        this.doc.image(`${this.qrcodePath}/qrcode.png`, 2, tableTop, { width: 70.87, height: 70.87 });

        tableTop += 4;

        const docDest = this.documento.mascaraCnpjCpf(this.dest?.CNPJCPF || this.dest?.CNPJ || this.dest?.CPF || this.dest?.idEstrangeiro || '')

        if (docDest && docDest !== '') {
            this.doc.font('Arial-bold').text(`CONSUMIDOR - DOC ${docDest}`, 75, tableTop, {
                align: 'left',
                lineGap: 1,
                continued: true,
            }).font('Arial')
                .text(' - Marco Aurélio Silva Lima -', {
                    lineGap: 1,
                    continued: true,
                })
                .text('Rua Teste teste teste, 262, Bairro Teste, Taubaté - SP');
            tableTop = this.doc.y + 4;
        } else {
            this.doc.text('CONSUMIDOR NÃO IDENTIFICADO', 75, tableTop, {
                align: 'left',
            });
            tableTop = this.doc.y + 4;
        }

        const data = parseISO(this.ide.dhEmi);
        const dtaEmi = format(data, 'dd/MM/yyyy HH:mm:ss');

        let dtaAut = format(new Date(), 'dd/MM/yyyy HH:mm:ss');
        if (this.protNFe?.infProt.dhRecbto) {
            const dataAut = parseISO(this.protNFe?.infProt.dhRecbto);
            dtaAut = format(dataAut, 'dd/MM/yyyy HH:mm:ss');
        }

        this.doc.font('Arial-bold').text(`NCF-e nº ${this.ide.nNF} Série ${this.ide.serie} ${dtaEmi}`, 75, tableTop, {
            align: 'left',
            lineGap: 1,
        })
            .text('Protocolo de autorização: ', {
                continued: true,
                lineGap: 1,
            })
            .font('Arial')
            .text(this.protNFe?.infProt.nProt || '123')
            .font('Arial-bold')
            .text('Data de autorização ', {
                continued: true,
                lineGap: 1,
            })
            .font('Arial')
            .text(dtaAut);

        tableTop = this.doc.y + 20;

        this.doc.text('Tributos Totais Incidentes (Lei Federal 12.741/2012): R$ 22,90', 0, tableTop, {
            align: 'center'
        });
    }

    async generatePDF(exibirMarcaDaguaDanfe?: boolean) {
        try {
            this.exibirMarcaDaguaDanfe = exibirMarcaDaguaDanfe || true;

            this.saveQRCode(this.infNFeSupl?.qrCode  || '')

            this.doc.pipe(fs.createWriteStream(this.outputPath));

            this.drawHeader(true);

            this._buildProdutos();

            this._buildTotais();

            this.drawFooter();

            this.doc.end();

            return {
                message: `  DANFE Gerada em '${this.outputPath}'`,
                success: true,
            };
        } catch (error: any) {
            throw new Error(`Erro ao gerar DANFE: ${error.message}`);
        }
    }
}

export default NFCEGerarDanfe;

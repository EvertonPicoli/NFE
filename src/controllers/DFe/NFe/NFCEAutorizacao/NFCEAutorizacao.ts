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
import { AxiosInstance, AxiosResponse } from 'axios';
import NFERetornoAutorizacao from './NFERetornoAutorizacao.js';
import { Json } from '../../../../utils/xml2json.js';
import Environment from '@Classes/Environment.js';
import Utility from '@Utils/Utility.js';
import XmlBuilder from '@Classes/XmlBuilder.js';
import NFEAutorizacaoHandler from './util/NFEAutorizacaoHandler.js';
import { GenericObject, LayoutNFe, NFe, ProtNFe } from '@Protocols';
import BaseNFE from '../BaseNFe/BaseNFe.js';
import { format } from 'date-fns';
import { generateQRCodeURLOffline, generateQRCodeURLOnline } from './util/NFCEQRCode.js';
import xml2js, { parseStringPromise, Builder } from 'xml2js';

class NFCEAutorizacao extends BaseNFE {
    xmlNFe: string[];
    constructor(environment: Environment, utility: Utility, xmlBuilder: XmlBuilder, axios: AxiosInstance) {
        super(environment, utility, xmlBuilder, 'NFEAutorizacao', axios);
        this.xmlNFe = [];
    }

    protected gerarXml(data: NFe): string {
        return this.gerarXmlNFCEAutorizacao(data);
    }

    protected salvaArquivos(xmlConsulta: string, responseInJson: GenericObject, xmlRetorno: AxiosResponse<any, any>, options?: Record<string, any>): GenericObject {

        // Recupera configuração do ambiente para verificar se os arquivos gerados serão gravados em disco
        const config = this.environment.getConfig();
        let dateAndTimeInFileName = config.dfe.incluirTimestampNoNomeDosArquivos;

        const createFileName = (prefix: string | undefined, includeMethodName?: boolean) => {
            const dtaTime = dateAndTimeInFileName ? `-${format(new Date(), 'dd-MM-yyyy-HHmm')}` : '';

            const baseFileName = includeMethodName ? `${this.metodo}` : '';
            const prefixPart = prefix ? includeMethodName ? `-${prefix}` : `${prefix}` : '';
            const nfePart = responseInJson.chNFe ? `-${responseInJson.chNFe}` : '';
            const dateTimePart = dtaTime;

            return `${baseFileName}${prefixPart}${nfePart}${dateTimePart}`;
        }

        const salvarArquivo = (data: any, prefix: string | undefined, path: string | undefined, fileType: 'xml' | 'json', includeMethodName?: boolean) => {
            const fileName = createFileName(prefix, includeMethodName);
            const method = fileType === 'xml' ? 'salvaXML' : 'salvaJSON';

            this.utility[method]({
                data: data,
                fileName,
                metodo: this.metodo,
                path,
            });
        };

        let chNFe = ''
        let xmlAutorizacaoInJson: GenericObject = {} as GenericObject;
        let xMotivoPorXml: GenericObject[] = [];
        let xmlsInJson: GenericObject[] = [];
        if (options) {
            const { xmlAutorizacao } = options;

            const json = new Json();

            for (let i = 0; i < xmlAutorizacao.length; i++) {
                xmlAutorizacaoInJson = json.convertXmlToJson(xmlAutorizacao[i], 'NFCEAutorizacaoFinal');
                xmlsInJson.push(xmlAutorizacaoInJson);

                const chNFe = xmlAutorizacaoInJson.protNFe.infProt.chNFe;
                const xMotivo = xmlAutorizacaoInJson.protNFe.infProt.xMotivo;
                const cStat = xmlAutorizacaoInJson.protNFe.infProt.cStat;
                xMotivoPorXml.push({
                    chNFe,
                    xMotivo,
                    cStat,
                })

                if (config.dfe.armazenarXMLAutorizacao) {
                    salvarArquivo(xmlAutorizacao[i], chNFe, config.dfe.pathXMLAutorizacao, 'xml', false);
                    salvarArquivo(xmlAutorizacaoInJson, chNFe, config.dfe.pathXMLAutorizacao, 'json', false);
                }
            }

            return {
                success: true,
                xMotivo: xMotivoPorXml,
                response: xmlsInJson,
            }
        }
        return {
            success: true,
            xMotivo: xMotivoPorXml,
            response: xmlsInJson,
        }
    }

    private async trataRetorno(xmlRetorno: string, indSinc: number, responseInJson: GenericObject) {
        try {
            /**
             * Captura o valor nRec e protNFe
             */
            const { nRec, protNFe } = this.utility.getProtNFe(xmlRetorno);

            /**
             * 0 - assíncrona
             * 1 - síncrona
             */
            let tipoEmissao = 0;
            if (indSinc === 1 && protNFe) {
                tipoEmissao = 1;
            }

            const nfeRetornoAut = new NFERetornoAutorizacao(this.environment, this.utility, this.xmlBuilder, this.axios);
            const retorno = await nfeRetornoAut.getXmlRetorno({
                tipoEmissao,
                nRec,
                protNFe,
                xmlNFe: this.xmlNFe
            });

            return retorno;
        } catch (error: any) {
            throw new Error(error.message)
        }
    }

    /**
     * Método utilitário para criação do XML a partir de um Objeto
     */


    private anoMesEmissao(dhEmi: string) {
        // Lógica para obter o ano e mês de emissão (AAMM)
        const dataAtual = new Date(dhEmi);
        const ano = dataAtual.getFullYear().toString().slice(-2);
        const mes = (dataAtual.getMonth() + 1).toString().padStart(2, '0');

        return ano + mes;
    }

    private gerarCodigoNumerico() {
        // Lógica para gerar um código numérico aleatório de 8 dígitos
        return Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
    }

    private calcularModulo11(sequencia: string) {
        const pesos = [4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

        let somatoria = 0;

        for (let i = 0; i < sequencia.length; i++) {
            somatoria += parseInt(sequencia.charAt(i)) * pesos[i];
        }

        const restoDivisao = somatoria % 11;
        const digitoVerificador = restoDivisao === 0 || restoDivisao === 1 ? 0 : 11 - restoDivisao;

        return digitoVerificador;
    }

    private calcularDigitoVerificador(data: LayoutNFe) {
        const {
            infNFe: {
                ide: { cUF, mod, serie, nNF, tpEmis, cNF, dhEmi },
                emit: { CNPJCPF }
            }
        } = data;

        const anoMes = this.anoMesEmissao(dhEmi);

        // Montando a sequência para o cálculo do dígito verificador
        const sequencia = `${cUF}${anoMes}${CNPJCPF}${mod}${String(serie).padStart(3, '0')}${String(nNF).padStart(9, '0')}${tpEmis}${cNF}`;

        // Calculando o dígito verificador
        const dv = this.calcularModulo11(sequencia);

        // Montando a chave de acesso
        const chaveAcesso = `NFe${sequencia}` + dv;
        this.chaveNfe = `${sequencia}${dv}`;

        return {
            chaveAcesso,
            dv
        };
    }

    private validaDocumento(doc: string, campo: string) {
        // Valida se CPF ou CNPJ
        const nfeAutorizacaoHandler = new NFEAutorizacaoHandler();
        const { documentoValido, tipoDoDocumento } = nfeAutorizacaoHandler.validarCpfCnpj(doc);

        if (!documentoValido || tipoDoDocumento === 'Desconhecido') {
            const message = tipoDoDocumento === 'Desconhecido'
                ? `Documento do ${campo} ausente ou inválido`
                : `${tipoDoDocumento} do ${campo} é inválido`
            throw new Error(message);
        }

        return tipoDoDocumento;
    }

    private extrairDigestValue(xmlAssinado: string): string {
        const match = xmlAssinado.match(/<DigestValue>([^<]+)<\/DigestValue>/);
        if (match && match[1]) {
            return match[1];
        }
        throw new Error('DigestValue não encontrado no XML assinado.');
    }

    async atualizarQRCode(xml: string, novoValor: string): Promise<string> {
        try {
            // Converter a string XML para um objeto JavaScript
            const xmlObject = await parseStringPromise(xml);
            console.log(xmlObject.NFe.infNFeSupl[0].qrCode);
            // Navegar até o qrCode e atualizar o valor
            if (xmlObject.NFe?.infNFeSupl[0]?.qrCode) {
                xmlObject.NFe.infNFeSupl[0].qrCode[0] = novoValor; // Atualiza o valor
            } else {
                throw new Error('Tag qrCode não encontrada no XML.');
            }

            // Converter o objeto JavaScript de volta para uma string XML
            const builder = new Builder();
            return builder.buildObject(xmlObject);
        } catch (error) {
            console.error('Erro ao atualizar o QR Code:', error);
            throw error;
        }
    }

    private gerarXmlNFCEAutorizacao(data: NFe) {

        const createXML = (NFe: LayoutNFe) => {
            // Verificando se existe mais de um produto
            if (NFe?.infNFe?.det instanceof Array) {
                // Adicionando indice ao item
                const formatedItens = NFe.infNFe.det.map((det, index) => {
                    return {
                        $: {
                            nItem: index + 1,
                        },
                        ...det,
                    };
                });
                NFe.infNFe.det = formatedItens;
            }

            // Cria chave da nota e grava digito verificador
            const { chaveAcesso, dv } = this.calcularDigitoVerificador(NFe)
            NFe.infNFe.ide.cDV = dv;
            NFe.infNFe.ide.verProc = NFe.infNFe.ide.verProc || '1.0.0.0';

            // Valida Documento do emitente
            NFe.infNFe.emit = Object.assign({ [this.validaDocumento(String(NFe.infNFe.emit.CNPJCPF), 'emitente')]: NFe.infNFe.emit.CNPJCPF }, NFe.infNFe.emit)
            delete NFe.infNFe.emit.CNPJCPF;
            // Valida Documento do destinatário
            NFe.infNFe.dest = Object.assign({ [this.validaDocumento(String(NFe.infNFe.dest.CNPJCPF), 'destinatário')]: NFe.infNFe.dest.CNPJCPF }, NFe.infNFe.dest)
            delete NFe.infNFe.dest.CNPJCPF;
            // Valida Documento do transportador
            if (NFe.infNFe.transp.transporta) {
                NFe.infNFe.transp.transporta = Object.assign({ [this.validaDocumento(String(NFe.infNFe.transp.transporta?.CNPJCPF), 'transportador')]: NFe.infNFe.transp.transporta?.CNPJCPF }, NFe.infNFe.transp.transporta)
                delete NFe.infNFe.transp.transporta?.CNPJCPF;
            }

            // Valida Documento do produtor rural
            if (NFe.infNFe?.NFref instanceof Array) {
                const NFrefArray = NFe.infNFe.NFref;
                if (NFrefArray && NFrefArray.length > 0) {
                    NFe.infNFe.NFref = NFrefArray.map(NFref => {
                        if (NFref.refNFP) {
                            NFref.refNFP = Object.assign(
                                { [this.validaDocumento(String(NFref.refNFP.CNPJCPF), 'produtor rural')]: NFref.refNFP.CNPJCPF },
                                NFref.refNFP
                            );
                            delete NFref.refNFP.CNPJCPF;
                        }
                        return NFref;
                    });
                }
            } else {
                if (NFe.infNFe.NFref && NFe.infNFe.NFref.refNFP) {
                    NFe.infNFe.NFref.refNFP = Object.assign(
                        { [this.validaDocumento(String(NFe.infNFe.NFref.refNFP.CNPJCPF), 'produtor rural')]: NFe.infNFe.NFref.refNFP.CNPJCPF },
                        NFe.infNFe.NFref.refNFP
                    )
                }
            }

            // Caso Seja hambiente de homologação
            if (NFe.infNFe.ide.tpAmb === 2) {
                NFe.infNFe.dest.xNome = 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL';
            }

            const { nfe: { idCSC, tokenCSC } } = this.environment.getConfig();

            let qrCode = '';
            if (![4, 9].includes(NFe.infNFe.ide.tpEmis)) {
                qrCode = generateQRCodeURLOnline(chaveAcesso, '2', NFe.infNFe.ide.tpAmb, Number(idCSC), String(tokenCSC));
            }

            // URL ONLINE FUNCIONANDO
            // prod a23fe9ca48d0463c98d35cfea1fcd760
            // hm 9cf44de0502d4351bf180843e6528e22 - 
            // https://www.homologacao.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx?p=35240808819185000172650011452380611650831616|2|2|1|CEB6F639B9E77EBB8362DDE927E738C20FE1BBA5

            const urlConsultaNFCe = this.utility.getUrlConsultaNFCe('URL-ConsultaNFCe', false, '');

            const nfeWithQrCode = {
                ...NFe,
                infNFeSupl: {
                    qrCode: qrCode,
                    urlChave: urlConsultaNFCe,
                }
            }
            NFe = nfeWithQrCode;

            const xmlObject = {
                $: {
                    xmlns: 'http://www.portalfiscal.inf.br/nfe'
                },
                infNFe: {
                    $: {
                        versao: "4.00",
                        Id: chaveAcesso,
                    },
                    ...NFe.infNFe
                },
                infNFeSupl: {
                    ...NFe.infNFeSupl
                }
            }

            const eventoXML = this.xmlBuilder.gerarXml(xmlObject, 'NFe')
            let xmlAssinado = this.xmlBuilder.assinarXML(eventoXML, 'infNFe')

            if ([4, 9].includes(NFe.infNFe.ide.tpEmis)) {
                // capturar digestValue
                const digestValue = this.extrairDigestValue(xmlAssinado);
                console.log({ digestValue })
               
                // substituir digestValue na tag qrcode
                const tpAmb = NFe.infNFe.ide.tpAmb;
                const valNF = NFe.infNFe.total.ICMSTot.vNF;
                qrCode = generateQRCodeURLOffline(chaveAcesso, '2', tpAmb, '02', valNF, digestValue, Number(idCSC), String(tokenCSC), eventoXML);
                console.log(qrCode)

                xml2js.parseString(xmlAssinado, (err, result) => {
                    if (err) {
                        console.error('Erro ao parsear o XML para atualização do qrCode:', err);
                    } else {
                        if (result.NFe?.infNFeSupl[0]?.qrCode) {
                            result.NFe.infNFeSupl[0].qrCode[0] = qrCode; // Atualiza o valor
                           
                            const builder = new Builder({
                                headless: true, renderOpts: {
                                    pretty: false
                                },
                            });
                            xmlAssinado = builder.buildObject(result)
                        } else {
                            throw new Error('Tag qrCode não encontrada no XML.');
                        }
                    }
                });


            }
            //console.log(xmlAssinado)
            this.xmlNFe.push(xmlAssinado);
        }

        if (data.NFe instanceof Array) {
            for (let i = 0; i < data.NFe.length; i++) {
                const NFe = data.NFe[i];
                createXML(NFe);
            }
        } else {
            createXML(data.NFe);
        }

        // Base do XML
        const baseXML = {
            $: {
                versao: "4.00",
                xmlns: 'http://www.portalfiscal.inf.br/nfe'
            },
            idLote: data.idLote,
            indSinc: data.indSinc,
            _: '[XML]'
        }

        // Gera base do XML
        const xml = this.xmlBuilder.gerarXml(baseXML, 'enviNFe')

        return xml.replace('[XML]', this.xmlNFe.join(''));
    }

    protected async gerarConsulta(xmlConsulta: string) {
        try {
            // Valida Schema
            await this.utility.validateSchema(xmlConsulta, this.metodo)

            // Capturando a url do método para o namespace xmlns
            const { method, action } = this.utility.getSoapInfo(this.metodo);
            console.log({ method, action })
            // Criando envelop SOAP (estrutura para e envio do XML)
            const xmlFormated = this.xmlBuilder.buildSoapEnvelope(xmlConsulta, method);

            // Retorna o Http.Agent contendo os certificados das Autoridades Certificadoras
            const agent = this.environment.getHttpAgent();

            // Retorna a url do webservice NFEStatusServico
            const webServiceUrl = this.utility.getWebServiceUrl(this.metodo, false, '', 'NFCe');

            return {
                xmlFormated,
                agent,
                webServiceUrl,
                action
            }

        } catch (error: any) {
            throw new Error(error.message)
        }
    }

    async Exec(data: NFe): Promise<{
        success: boolean;
        xMotivo: GenericObject;
        xmls: {
            NFe: LayoutNFe;
            protNFe: ProtNFe
        }[];
    }> {
        let xmlConsulta = '';
        let soapXML = '';
        try {
            // Gerando XML para consulta de Status do Serviço
            xmlConsulta = this.gerarXmlNFCEAutorizacao(data);

            const { xmlFormated, agent, webServiceUrl, action } = await this.gerarConsulta(xmlConsulta);
            soapXML = soapXML

            // Salva XML de Consulta
            this.utility.salvaConsulta(xmlConsulta, xmlFormated, this.metodo);

            // Efetua requisição para o webservice NFEStatusServico
            const xmlRetorno = await this.axios.post(webServiceUrl, xmlFormated, {
                headers: {
                    'Content-Type': 'text/xml; charset=utf-8',
                    'SOAPAction': action,
                    'CSC': '9cf44de0-502d-4351-bf18-0843e6528e22',
                },
                httpsAgent: agent
            });

            /**
             * Verifica se houve rejeição no processamento do lote
             */
            const responseInJson = this.utility.verificaRejeicao(xmlRetorno.data, this.metodo);

            // Salva XML de Retorno
            this.utility.salvaRetorno(xmlRetorno.data, responseInJson, this.metodo);

            const retorno = await this.trataRetorno(xmlRetorno.data, data.indSinc, responseInJson);

            const xmlFinal = this.salvaArquivos(xmlConsulta, responseInJson, xmlRetorno.data,
                {
                    xmlAutorizacao: retorno.data,
                    xMotivo: retorno.message
                })

            return {
                success: true,
                xMotivo: xmlFinal.xMotivo,
                xmls: xmlFinal.response,
            }

        } catch (error: any) {
            // Salva XML de Consulta
            // console.log(error)
            this.utility.salvaConsulta(xmlConsulta, soapXML, this.metodo);
            throw new Error(error.message)
        }
    }

}

export default NFCEAutorizacao;
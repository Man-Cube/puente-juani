const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
app.use(cors()); 
app.use(express.json()); 

const headersScanntech = {
    "Authorization": "Basic QUQxMTE0OCRpcG9zc2IzYXI6R1VTVEkxMA==",
    "Content-Type": "application/json",
    "emp_codigo": "11148",
    "gestion": "1222"
};

const URL_GOOGLE_SCRIPT = "https://script.google.com/macros/s/AKfycbzJA-NORIlhN3pPR-8ACGeaNtlxVVivlpiU9ulSn8TkiO9sSz26RSs--UrEN6aX3MyZ/exec";

// =======================================================
// 0. MOTOR RASTREADOR DE PRECIOS COMPETENCIA V3 (INTELIGENTE)
// =======================================================
app.get('/rastrear-precios/:codigo', async (req, res) => {
    const codigo = req.params.codigo.trim();
    let precioCoco = "-";
    let precioMaxi = "-";

    // Nos disfrazamos de un Google Chrome de escritorio real
    const configAxios = {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'es-AR,es;q=0.8,en-US;q=0.5,en;q=0.3',
        },
        timeout: 10000 // Si tarda más de 10 seg, aborta para no colgar el Excel
    };

    // Función que extrae y limpia el precio sin importar dónde esté
    const buscarPrecioEnHTML = ($) => {
        let p = $('meta[itemprop="price"]').attr('content') || $('[itemprop="price"]').attr('content');
        if (!p) {
            let texto = $('.current-price, .price, .precio, span[itemprop="price"], .woocommerce-Price-amount').first().text();
            if (texto) {
                let limpio = texto.replace(/[^\d.,]/g, '').trim();
                // Arreglamos el formato argentino (ej: 1.200,50 -> 1200.50)
                if (limpio.includes(',') && limpio.includes('.')) limpio = limpio.replace(/\./g, '').replace(',', '.');
                else if (limpio.includes(',')) limpio = limpio.replace(',', '.');
                p = limpio;
            }
        }
        return p && !isNaN(parseFloat(p)) ? parseFloat(p).toFixed(2) : null;
    };

    try {
        console.log(`\n🕵️ [RASTREADOR] Buscando ${codigo} en Super Coco...`);
        const resCoco = await axios.get(`https://supercoco.com.ar/search/?q=${codigo}`, configAxios);
        let $coco = cheerio.load(resCoco.data);
        
        // Intento 1: ¿El precio ya está a la vista? (Redirección o grilla)
        precioCoco = buscarPrecioEnHTML($coco) || "-";

        // Intento 2: Si no hay precio a la vista, buscamos el link de la foto y entramos
        if (precioCoco === "-") {
            let link = $coco('.product-miniature a, .thumbnail-container a, .product-title a').first().attr('href');
            if (link) {
                if (link.startsWith('/')) link = 'https://supercoco.com.ar' + link;
                console.log(`   ➡️ Entrando al link interno: ${link}`);
                const resCoco2 = await axios.get(link, configAxios);
                precioCoco = buscarPrecioEnHTML(cheerio.load(resCoco2.data)) || "-";
            }
        }
        console.log(`   ✅ Precio Coco final: ${precioCoco}`);
    } catch (error) {
        console.error(`   ❌ Error Coco: ${error.response ? error.response.status : error.message}`);
    }

    try {
        console.log(`\n🕵️ [RASTREADOR] Buscando ${codigo} en Maxidescuento...`);
        const resMaxi = await axios.get(`https://www.maxidescuento.com.ar/search/?q=${codigo}`, configAxios);
        let $maxi = cheerio.load(resMaxi.data);
        
        precioMaxi = buscarPrecioEnHTML($maxi) || "-";

        if (precioMaxi === "-") {
            let link = $maxi('.product-miniature a, .thumbnail-container a, .product-title a').first().attr('href');
            if (link) {
                if (link.startsWith('/')) link = 'https://www.maxidescuento.com.ar' + link;
                console.log(`   ➡️ Entrando al link interno: ${link}`);
                const resMaxi2 = await axios.get(link, configAxios);
                precioMaxi = buscarPrecioEnHTML(cheerio.load(resMaxi2.data)) || "-";
            }
        }
        console.log(`   ✅ Precio Maxi final: ${precioMaxi}`);
    } catch (error) {
        console.error(`   ❌ Error Maxi: ${error.response ? error.response.status : error.message}`);
    }

    res.json({ exito: true, codigo: codigo, coco: precioCoco, maxi: precioMaxi });
});


// =======================================================
// 1. BUSCADOR INTELIGENTE: BARRAS O PLU (CÓDIGO EXTERNO)
// =======================================================
app.get('/buscar/:codigo', async (req, res) => {
    const codigoLeido = req.params.codigo;
    try {
        let urlBasica = `https://backend-k8.scanntech.com/be-modulos-precios-angular-2.132.30-MINARG/api/datos-basicos-articulos?filter=codigoBarras%253AEQ%253A${codigoLeido}`;
        let resBasica = await fetch(urlBasica, { method: "GET", headers: headersScanntech });
        let dataBasica = await resBasica.json();
        let art = dataBasica.content && dataBasica.content.length > 0 ? dataBasica.content[0] : (Array.isArray(dataBasica) && dataBasica.length > 0 ? dataBasica[0] : null);

        if (!art || !art.codigo) {
            urlBasica = `https://backend-k8.scanntech.com/be-modulos-precios-angular-2.132.30-MINARG/api/datos-basicos-articulos?filter=codigoExterno%253AEQ%253A${codigoLeido}`;
            resBasica = await fetch(urlBasica, { method: "GET", headers: headersScanntech });
            dataBasica = await resBasica.json();
            art = dataBasica.content && dataBasica.content.length > 0 ? dataBasica.content[0] : (Array.isArray(dataBasica) && dataBasica.length > 0 ? dataBasica[0] : null);
        }

        if (!art || !art.codigo) {
            return res.status(404).json({ exito: false, error: "Artículo no encontrado" });
        }

        const codigoInterno = art.codigo;
        const urlPesada = `https://backend-k8.scanntech.com/be-modulos-precios-angular-2.132.30-MINARG/api/articulos/${codigoInterno}?disponibilidadDistribucion=%7B%22fecha%22:null,%22tipoDisponibilidadDistribucion%22:%22IMMEDIATE%22%7D&filter=codigoListaPrecioVenta%253AEQ%253A3163`;
        const resPesada = await fetch(urlPesada, { method: "GET", headers: headersScanntech });
        const articuloCompleto = await resPesada.json();

        res.json({ exito: true, articulo: articuloCompleto });
    } catch (error) {
        res.status(500).json({ exito: false, error: "Error interno en buscador" });
    }
});

// =======================================================
// 2. BUSCADOR DIRECTO POR ID INTERNO
// =======================================================
app.get('/buscar-id/:id', async (req, res) => {
    const codigoInterno = req.params.id;
    try {
        const urlPesada = `https://backend-k8.scanntech.com/be-modulos-precios-angular-2.132.30-MINARG/api/articulos/${codigoInterno}?disponibilidadDistribucion=%7B%22fecha%22:null,%22tipoDisponibilidadDistribucion%22:%22IMMEDIATE%22%7D&filter=codigoListaPrecioVenta%253AEQ%253A3163`;
        const resPesada = await fetch(urlPesada, { method: "GET", headers: headersScanntech });
        res.json({ exito: true, articulo: await resPesada.json() });
    } catch (error) {
        res.status(500).json({ exito: false });
    }
});

// =======================================================
// 3. BUSCADOR POR TEXTO / DESCRIPCIÓN
// =======================================================
app.get('/buscar-texto/:texto', async (req, res) => {
    const textoBusqueda = encodeURIComponent(req.params.texto.toUpperCase());
    try {
        const urlTexto = `https://backend-k8.scanntech.com/be-modulos-precios-angular-2.132.30-MINARG/api/articulos-buscador?filter=descripcion%253ALIKE%253A${textoBusqueda}%252CincluirCombos%253AEQ%253Atrue&orderBy=desc(descripcion)&estado=ACTIVAS&initialRow=0&rowCount=50`;
        const respuesta = await fetch(urlTexto, { method: "GET", headers: headersScanntech });
        const data = await respuesta.json();
        res.json({ exito: true, resultados: data.content || data || [] });
    } catch (error) {
        res.status(500).json({ exito: false });
    }
});

// =======================================================
// 4. ACTUALIZADOR DE PRECIOS CON EXCEL AUTOMÁTICO
// =======================================================
app.post('/modificar-precio', async (req, res) => {
    console.log("🚀 [Precios] Iniciando modificación en bloque...");
    try {
        const respuestaScanntech = await fetch("https://backend-k8.scanntech.com/be-modulos-precios-angular-2.132.30-MINARG/api/articulos/salvar-lote", {
            method: "PUT", 
            headers: headersScanntech, 
            body: JSON.stringify(req.body)
        });

        if (respuestaScanntech.ok) {
            const dataJSON = await respuestaScanntech.json();
            
            try {
                const payloadExcel = req.body.nuevos.map(item => ({
                    codigo: item.codigoBarras || item.codigoExterno || item.codigo,
                    desc: item.descripcion,
                    precio: item.venta && item.venta.valor ? parseFloat(item.venta.valor) : 0
                }));

                fetch(URL_GOOGLE_SCRIPT, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payloadExcel)
                }).catch(e => console.error("❌ [Sincro] Error:", e));
            } catch (errExcel) {}

            res.json({ exito: true, data: dataJSON });
        } else {
            const motivo = await respuestaScanntech.text();
            res.status(400).json({ exito: false, error: motivo });
        }
    } catch (error) {
        res.status(500).json({ exito: false, error: error.message });
    }
});

// =======================================================
// 5. CAÑÓN DE DISTRIBUCIÓN A CAJAS
// =======================================================
app.post('/distribuir', async (req, res) => {
    try {
        const urlDistribucion = "https://modulos-be-minoristas.scanntech.com/be-modulos-distribuciones-tareas-angular_1.1.13/api/distribuciones-tareas-locales-unificadas/completar-sin-imprimir?completarParaTodosLosLocales=true";
        const respuestaDist = await fetch(urlDistribucion, {
            method: "PUT", headers: headersScanntech, body: JSON.stringify(req.body)
        });
        if (respuestaDist.ok) {
            res.json({ exito: true });
        } else {
            res.status(400).json({ exito: false });
        }
    } catch (error) {
        res.status(500).json({ exito: false });
    }
});

// =======================================================
// 6. MOVIMIENTOS DE INVENTARIO (STOCK UNIFICADO)
// =======================================================
app.post('/actualizar-stock', async (req, res) => {
    try {
        const urlStock = "https://modulos-be-2-minoristas.scanntech.com/be-modulos-inventario-angular/api/movimiento";
        const respuestaStock = await fetch(urlStock, {
            method: "POST", headers: headersScanntech, body: JSON.stringify(req.body)
        });
        if (respuestaStock.ok) res.json({ exito: true });
        else res.status(400).json({ exito: false });
    } catch (error) {
        res.status(500).json({ exito: false });
    }
});

// =======================================================
// 7. DESCARGAR PDF DE ETIQUETAS OFICIAL
// =======================================================
app.post('/imprimir-etiquetas', async (req, res) => {
    try {
        const urlImprimir = "https://modulos-be-2-minoristas.scanntech.com/be-modulos-imprimir-etiquetas-angular_1.2.3/api/etiquetas/imprimir";
        const respuestaScanntech = await fetch(urlImprimir, {
            method: "PUT", 
            headers: headersScanntech,
            body: JSON.stringify(req.body)
        });

        if (respuestaScanntech.ok) {
            res.setHeader("Content-Type", "application/pdf");
            const buffer = await respuestaScanntech.arrayBuffer();
            res.send(Buffer.from(buffer));
        } else {
            const motivo = await respuestaScanntech.text();
            res.status(400).json({ exito: false, error: motivo });
        }
    } catch (error) {
        res.status(500).json({ exito: false });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor ACTIVO en el puerto ${PORT}`);
});

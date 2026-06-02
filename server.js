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

// ENCHUFE SECRETO AL EXCEL DE LAS DOÑAS
const URL_GOOGLE_SCRIPT = "https://script.google.com/macros/s/AKfycbzJA-NORIlhN3pPR-8ACGeaNtlxVVivlpiU9ulSn8TkiO9sSz26RSs--UrEN6aX3MyZ/exec";

// =======================================================
// 0. MOTOR RASTREADOR DE PRECIOS COMPETENCIA
// =======================================================
app.get('/rastrear-precios/:codigo', async (req, res) => {
    const codigo = req.params.codigo.trim();
    
    // Valores por defecto por si no los encuentran o no los trabajan
    let precioCoco = "-";
    let precioMaxi = "-";

    try {
        // 1. ARAÑA PARA SUPER COCO
        const urlCoco = `https://supercoco.com.ar/search/?q=${codigo}`;
        const responseCoco = await axios.get(urlCoco, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        
        const $coco = cheerio.load(responseCoco.data);
        let textoPrecioCoco = $coco('.price, .precio, .woocommerce-Price-amount, .js-price-display').first().text();
        
        if (textoPrecioCoco && textoPrecioCoco.includes('$')) {
            precioCoco = textoPrecioCoco.replace(/[^\d.,]/g, '').trim();
        }
    } catch (error) {
        console.log(`[RASTREADOR] Super Coco falló para el código: ${codigo}`);
    }

    try {
        // 2. ARAÑA PARA MAXIDESCUENTO
        const urlMaxi = `https://www.maxidescuento.com.ar/search/?q=${codigo}`;
        const responseMaxi = await axios.get(urlMaxi, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        
        const $maxi = cheerio.load(responseMaxi.data);
        let textoPrecioMaxi = $maxi('.price, .precio, .woocommerce-Price-amount, .js-price-display').first().text();
        
        if (textoPrecioMaxi && textoPrecioMaxi.includes('$')) {
            precioMaxi = textoPrecioMaxi.replace(/[^\d.,]/g, '').trim();
        }
    } catch (error) {
        console.log(`[RASTREADOR] Maxidescuento falló para el código: ${codigo}`);
    }

    // Le devolvemos el informe al Excel
    res.json({
        exito: true,
        codigo: codigo,
        coco: precioCoco,
        maxi: precioMaxi
    });
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
// 4. ACTUALIZADOR DE PRECIOS CON EXCEL AUTOMÁTICO INCLUIDO
// =======================================================
app.post('/modificar-precio', async (req, res) => {
    console.log("🚀 [Precios] Iniciando modificación en bloque...");
    try {
        const respuestaScanntech = await fetch("https://backend-k8.scanntech.com/be-modulos-precios-angular-2.132.30-MINARG/api/articulos/salvar-lote", {
            method: "PUT", 
            headers: headersScanntech, 
            body: JSON.stringify(req.body)
        });

        console.log(`📡 [Precios] Scanntech respondió con Status: ${respuestaScanntech.status}`);
        if (respuestaScanntech.ok) {
            const dataJSON = await respuestaScanntech.json();
            console.log("✅ [Precios] Lote guardado con éxito en Scanntech.");

            // DISPARO ASINCRÓNICO DE FONDO AL EXCEL DEL CATÁLOGO
            try {
                // Mapeamos los artículos modificados al formato simple del Excel
                const payloadExcel = req.body.nuevos.map(item => ({
                    codigo: item.codigoBarras || item.codigoExterno || item.codigo,
                    desc: item.descripcion,
                    precio: item.venta && item.venta.valor ? parseFloat(item.venta.valor) : 0
                }));

                console.log("📡 [Sincro Catálogo] Enviando novedades de precios a Google Sheets...");
                
                // Hacemos el fetch sin 'await' para que no tranque la respuesta de la app del cel
                fetch(URL_GOOGLE_SCRIPT, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payloadExcel)
                })
                .then(r => console.log("📊 [Sincro Catálogo] Excel actualizado con éxito de fondo."))
                .catch(e => console.error("❌ [Sincro Catálogo] Error actualizando planilla:", e));

            } catch (errExcel) {
                console.error("❌ Error estructurando lote para el catálogo:", errExcel);
            }

            res.json({ exito: true, data: dataJSON });
        } else {
            const motivo = await respuestaScanntech.text();
            console.error("❌ [Precios] Scanntech rechazó el guardado:", motivo);
            res.status(400).json({ exito: false, error: motivo });
        }
    } catch (error) {
        console.error("💥 [Precios] Error crítico en el servidor puente:", error);
        res.status(500).json({ exito: false, error: error.message });
    }
});

// =======================================================
// 5. CAÑÓN DE DISTRIBUCIÓN A CAJAS
// =======================================================
app.post('/distribuir', async (req, res) => {
    console.log("🚀 [Distribución] Enviando tarea a las cajas del local...");
    try {
        const urlDistribucion = "https://modulos-be-minoristas.scanntech.com/be-modulos-distribuciones-tareas-angular_1.1.13/api/distribuciones-tareas-locales-unificadas/completar-sin-imprimir?completarParaTodosLosLocales=true";
        const respuestaDist = await fetch(urlDistribucion, {
            method: "PUT", headers: headersScanntech, body: JSON.stringify(req.body)
        });
        if (respuestaDist.ok) {
            console.log("✅ [Distribución] Éxito. Novedades replicadas.");
            res.json({ exito: true });
        } else {
            console.error("❌ [Distribución] Rebotada por Scanntech.");
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
// 7. DESCARGAR PDF DE ETIQUETAS OFICIAL (CON PUT)
// =======================================================
app.post('/imprimir-etiquetas', async (req, res) => {
    console.log("🚀 [PDF] Solicitando archivo original a Scanntech...");
    try {
        const urlImprimir = "https://modulos-be-2-minoristas.scanntech.com/be-modulos-imprimir-etiquetas-angular_1.2.3/api/etiquetas/imprimir";
        const respuestaScanntech = await fetch(urlImprimir, {
            method: "PUT", 
            headers: headersScanntech,
            body: JSON.stringify(req.body)
        });

        if (respuestaScanntech.ok) {
            console.log("✅ [PDF] Recibido de Scanntech perfectamente.");
            res.setHeader("Content-Type", "application/pdf");
            const buffer = await respuestaScanntech.arrayBuffer();
            res.send(Buffer.from(buffer));
        } else {
            const motivo = await respuestaScanntech.text();
            console.error("❌ [PDF] Scanntech denegó la impresión:", motivo);
            res.status(400).json({ exito: false, error: motivo });
        }
    } catch (error) {
        console.error("💥 [PDF] Error transmitiendo archivo:", error);
        res.status(500).json({ exito: false });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor ACTIVO en el puerto ${PORT}`);
});

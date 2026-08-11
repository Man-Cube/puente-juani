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
// 0. MOTOR RASTREADOR DE COMPETENCIA (DIA + MAXI)
// =======================================================
app.get('/rastrear-precios/:codigo', async (req, res) => {
    const codigo = req.params.codigo.trim();
    let precioCoco = "-";
    let precioMaxi = "-";

    const headersCamuflaje = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
    };

    const buscarPrecioEnHTML = ($) => {
        let p = $('meta[itemprop="price"]').attr('content') || $('[itemprop="price"]').attr('content');
        if (!p) {
            let texto = $('.current-price, .price, .precio, span[itemprop="price"]').first().text();
            if (texto) {
                let limpio = texto.replace(/[^\d.,]/g, '').trim();
                if (limpio.includes(',') && limpio.includes('.')) limpio = limpio.replace(/\./g, '').replace(',', '.');
                else if (limpio.includes(',')) limpio = limpio.replace(',', '.');
                p = limpio;
            }
        }
        return p && !isNaN(parseFloat(p)) ? parseFloat(p).toFixed(2) : null;
    };

    try {
        const searchUrlMaxi = `https://www.maxidescuento.com.ar/busqueda?controller=search&s=${codigo}`;
        const reqMaxi = await fetch(searchUrlMaxi, { headers: headersCamuflaje });
        if (reqMaxi.ok) {
            let $maxi = cheerio.load(await reqMaxi.text());
            precioMaxi = buscarPrecioEnHTML($maxi) || "-";
        }
    } catch (e) {}

    res.json({ exito: true, codigo: codigo, coco: precioCoco, maxi: precioMaxi });
});


// =======================================================
// 1. BUSCADOR INTELIGENTE: SCANNTECH + HISTORIAL INFLACIÓN
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
        
        // 1. Pedimos el artículo completo
        const urlPesada = `https://backend-k8.scanntech.com/be-modulos-precios-angular-2.132.30-MINARG/api/articulos/${codigoInterno}?disponibilidadDistribucion=%7B%22fecha%22:null,%22tipoDisponibilidadDistribucion%22:%22IMMEDIATE%22%7D&filter=codigoListaPrecioVenta%253AEQ%253A3163`;
        
        // 2. Calculamos fecha hace 6 meses
        const hace6Meses = new Date();
        hace6Meses.setMonth(hace6Meses.getMonth() - 6);
        const fechaDesdeStr = hace6Meses.toISOString().split('T')[0];
        
        // 3. Pedimos el historial
        const urlHistorial = `https://backend-k8.scanntech.com/be-modulos-precios-angular-2.132.30-MINARG/api/articulos/${codigoInterno}/historico-ventas?filter=fechaDesde%253AGE%253A${fechaDesdeStr}`;
        
        const [resPesada, resHistorial] = await Promise.all([
            fetch(urlPesada, { method: "GET", headers: headersScanntech }),
            fetch(urlHistorial, { method: "GET", headers: headersScanntech }).catch(() => null)
        ]);

        const articuloCompleto = await resPesada.json();
        
        let ultimaFecha = "Sin datos";
        let diasAntiguedad = 0;
        
        if (resHistorial && resHistorial.ok) {
            const histData = await resHistorial.json();
            const lista = histData.content || (Array.isArray(histData) ? histData : []);
            
            if (lista.length > 0) {
                // Buscamos la fecha más reciente en el historial
                let maxDate = 0;
                let maxDateStr = "";
                
                for (let i = 0; i < lista.length; i++) {
                    let fStr = lista[i].ingreso || lista[i].vigencia || lista[i].fecha;
                    if (fStr) {
                        let dateObj;
                        if (typeof fStr === 'number') {
                            dateObj = new Date(fStr);
                        } else if (fStr.includes('/')) {
                            const parts = fStr.split(' ')[0].split('/'); 
                            if (parts.length === 3) dateObj = new Date(parts[2], parts[1] - 1, parts[0]);
                        } else {
                            dateObj = new Date(fStr);
                        }
                        
                        if (dateObj && !isNaN(dateObj) && dateObj.getTime() > maxDate) {
                            maxDate = dateObj.getTime();
                            maxDateStr = fStr;
                        }
                    }
                }
                
                if (maxDate > 0) {
                    ultimaFecha = maxDateStr;
                    const diffTime = Math.abs(new Date() - maxDate);
                    diasAntiguedad = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                }
            }
        }

        res.json({ 
            exito: true, 
            articulo: articuloCompleto, 
            ultimaFecha: ultimaFecha,
            diasAntiguedad: diasAntiguedad 
        });
    } catch (error) {
        res.status(500).json({ exito: false, error: "Error interno" });
    }
});

// =======================================================
// 2. BUSCADORES EXTRA Y HERRAMIENTAS
// =======================================================
app.get('/buscar-id/:id', async (req, res) => {
    try {
        const urlPesada = `https://backend-k8.scanntech.com/be-modulos-precios-angular-2.132.30-MINARG/api/articulos/${req.params.id}?disponibilidadDistribucion=%7B%22fecha%22:null,%22tipoDisponibilidadDistribucion%22:%22IMMEDIATE%22%7D&filter=codigoListaPrecioVenta%253AEQ%253A3163`;
        const r = await fetch(urlPesada, { method: "GET", headers: headersScanntech });
        res.json({ exito: true, articulo: await r.json() });
    } catch (error) {
        res.status(500).json({ exito: false });
    }
});

app.get('/buscar-texto/:texto', async (req, res) => {
    try {
        const urlTexto = `https://backend-k8.scanntech.com/be-modulos-precios-angular-2.132.30-MINARG/api/articulos-buscador?filter=descripcion%253ALIKE%253A${encodeURIComponent(req.params.texto.toUpperCase())}%252CincluirCombos%253AEQ%253Atrue&orderBy=desc(descripcion)&estado=ACTIVAS&initialRow=0&rowCount=50`;
        const r = await fetch(urlTexto, { method: "GET", headers: headersScanntech });
        const data = await r.json();
        res.json({ exito: true, resultados: data.content || data || [] });
    } catch (error) {
        res.status(500).json({ exito: false });
    }
});

app.post('/modificar-precio', async (req, res) => {
    try {
        const r = await fetch("https://backend-k8.scanntech.com/be-modulos-precios-angular-2.132.30-MINARG/api/articulos/salvar-lote", {
            method: "PUT", headers: headersScanntech, body: JSON.stringify(req.body)
        });
        if (r.ok) {
            try {
                const payloadExcel = req.body.nuevos.map(i => ({
                    codigo: i.codigoBarras || i.codigoExterno || i.codigo, desc: i.descripcion, precio: i.venta && i.venta.valor ? parseFloat(i.venta.valor) : 0
                }));
                fetch(URL_GOOGLE_SCRIPT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payloadExcel) }).catch(()=>{});
            } catch (e) {}
            res.json({ exito: true, data: await r.json() });
        } else {
            res.status(400).json({ exito: false, error: await r.text() });
        }
    } catch (e) {
        res.status(500).json({ exito: false });
    }
});

app.post('/distribuir', async (req, res) => {
    try {
        const r = await fetch("https://modulos-be-minoristas.scanntech.com/be-modulos-distribuciones-tareas-angular_1.1.13/api/distribuciones-tareas-locales-unificadas/completar-sin-imprimir?completarParaTodosLosLocales=true", { method: "PUT", headers: headersScanntech, body: JSON.stringify(req.body) });
        res.json({ exito: r.ok });
    } catch (e) { res.status(500).json({ exito: false }); }
});

app.post('/actualizar-stock', async (req, res) => {
    try {
        const r = await fetch("https://modulos-be-2-minoristas.scanntech.com/be-modulos-inventario-angular/api/movimiento", { method: "POST", headers: headersScanntech, body: JSON.stringify(req.body) });
        res.json({ exito: r.ok });
    } catch (e) { res.status(500).json({ exito: false }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor ACTIVO en el puerto ${PORT}`);
});

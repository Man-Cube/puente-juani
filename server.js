const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors()); 
app.use(express.json()); 

const headersScanntech = {
    "Authorization": "Basic QUQxMTE0OCRpcG9zc2IzYXI6R1VTVEkxMA==",
    "Content-Type": "application/json",
    "emp_codigo": "11148",
    "gestion": "1222"
};

// 1. BUSCADOR INTELIGENTE: BARRAS O PLU (CÓDIGO EXTERNO)
app.get('/buscar/:codigo', async (req, res) => {
    const codigoLeido = req.params.codigo;
    try {
        // Intento A: Buscar por Código de Barras
        let urlBasica = `https://backend-k8.scanntech.com/be-modulos-precios-angular-2.132.30-MINARG/api/datos-basicos-articulos?filter=codigoBarras%253AEQ%253A${codigoLeido}`;
        let resBasica = await fetch(urlBasica, { method: "GET", headers: headersScanntech });
        let dataBasica = await resBasica.json();
        let art = dataBasica.content && dataBasica.content.length > 0 ? dataBasica.content[0] : (Array.isArray(dataBasica) && dataBasica.length > 0 ? dataBasica[0] : null);

        // Intento B: Si falló, buscar por Código Externo / PLU (Caso Quesos/Fiambres)
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
        console.error("Error buscando código:", error);
        res.status(500).json({ exito: false, error: "Error interno en buscador" });
    }
});

// 2. BUSCADOR DIRECTO POR ID INTERNO (EVITA ERRORES EN LISTAS DE TEXTO)
app.get('/buscar-id/:id', async (req, res) => {
    const codigoInterno = req.params.id;
    try {
        const urlPesada = `https://backend-k8.scanntech.com/be-modulos-precios-angular-2.132.30-MINARG/api/articulos/${codigoInterno}?disponibilidadDistribucion=%7B%22fecha%22:null,%22tipoDisponibilidadDistribucion%22:%22IMMEDIATE%22%7D&filter=codigoListaPrecioVenta%253AEQ%253A3163`;
        const resPesada = await fetch(urlPesada, { method: "GET", headers: headersScanntech });
        const articuloCompleto = await resPesada.json();
        res.json({ exito: true, articulo: articuloCompleto });
    } catch (error) {
        console.error("Error trayendo ID:", error);
        res.status(500).json({ exito: false, error: "Error interno al traer ficha" });
    }
});

// 3. BUSCADOR POR TEXTO / DESCRIPCIÓN
app.get('/buscar-texto/:texto', async (req, res) => {
    const textoBusqueda = encodeURIComponent(req.params.texto.toUpperCase());
    try {
        const urlTexto = `https://backend-k8.scanntech.com/be-modulos-precios-angular-2.132.30-MINARG/api/articulos-buscador?filter=descripcion%253ALIKE%253A${textoBusqueda}%252CincluirCombos%253AEQ%253Atrue&orderBy=desc(descripcion)&estado=ACTIVAS&initialRow=0&rowCount=50`;
        const respuesta = await fetch(urlTexto, { method: "GET", headers: headersScanntech });
        const data = await respuesta.json();
        const resultados = data.content ? data.content : (Array.isArray(data) ? data : []);
        res.json({ exito: true, resultados: resultados });
    } catch (error) {
        res.status(500).json({ exito: false, error: "Falla de conexión" });
    }
});

// 4. ACTUALIZADOR DE PRECIOS
app.post('/modificar-precio', async (req, res) => {
    try {
        const respuestaScanntech = await fetch("https://backend-k8.scanntech.com/be-modulos-precios-angular-2.132.30-MINARG/api/articulos/salvar-lote", {
            method: "PUT", headers: headersScanntech, body: JSON.stringify(req.body)
        });
        if (respuestaScanntech.ok) {
            res.json({ exito: true, data: await respuestaScanntech.json() });
        } else {
            res.status(400).json({ exito: false });
        }
    } catch (error) {
        res.status(500).json({ exito: false });
    }
});

// 5. CAÑÓN DE DISTRIBUCIÓN A CAJAS
app.post('/distribuir', async (req, res) => {
    try {
        const urlDistribucion = "https://modulos-be-minoristas.scanntech.com/be-modulos-distribuciones-tareas-angular_1.1.13/api/distribuciones-tareas-locales-unificadas/completar-sin-imprimir?completarParaTodosLosLocales=true";
        const respuestaDist = await fetch(urlDistribucion, {
            method: "PUT", headers: headersScanntech, body: JSON.stringify(req.body)
        });
        if (respuestaDist.ok) {
            res.json({ exito: true });
        } else {
            res.status(400).json({ exito: false, error: await respuestaDist.text() });
        }
    } catch (error) {
        res.status(500).json({ exito: false });
    }
});

// 6. MOVIMIENTOS DE INVENTARIO (STOCK)
app.post('/actualizar-stock', async (req, res) => {
    try {
        const urlStock = "https://modulos-be-2-minoristas.scanntech.com/be-modulos-inventario-angular/api/movimiento";
        const respuestaStock = await fetch(urlStock, {
            method: "POST", headers: headersScanntech, body: JSON.stringify(req.body)
        });
        if (respuestaStock.ok) {
            res.json({ exito: true });
        } else {
            res.status(400).json({ exito: false, error: await respuestaStock.text() });
        }
    } catch (error) {
        res.status(500).json({ exito: false });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor ACTIVO en el puerto ${PORT}`);
});

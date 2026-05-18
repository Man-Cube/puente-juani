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

// 1. BUSCADOR INTELIGENTE EN 2 PASOS
app.get('/buscar/:codigo', async (req, res) => {
    const codigoLeido = req.params.codigo;
    try {
        let urlBasica = `https://backend-k8.scanntech.com/be-modulos-precios-angular-2.132.30-MINARG/api/datos-basicos-articulos?filter=codigoBarras%253AEQ%253A${codigoLeido}`;
        let resBasica = await fetch(urlBasica, { method: "GET", headers: headersScanntech });
        let dataBasica = await resBasica.json();
        let articuloBasico = Array.isArray(dataBasica) ? dataBasica[0] : (dataBasica.content ? dataBasica.content[0] : (dataBasica.codigo ? dataBasica : null));

        if (!articuloBasico) {
            urlBasica = `https://backend-k8.scanntech.com/be-modulos-precios-angular-2.132.30-MINARG/api/datos-basicos-articulos?filter=codigoExterno%253AEQ%253A${codigoLeido}`;
            resBasica = await fetch(urlBasica, { method: "GET", headers: headersScanntech });
            dataBasica = await resBasica.json();
            articuloBasico = Array.isArray(dataBasica) ? dataBasica[0] : (dataBasica.content ? dataBasica.content[0] : (dataBasica.codigo ? dataBasica : null));
        }

        if (!articuloBasico || !articuloBasico.codigo) {
            return res.status(404).json({ exito: false, error: "Artículo fantasma" });
        }

        const codigoInterno = articuloBasico.codigo;
        const urlPesada = `https://backend-k8.scanntech.com/be-modulos-precios-angular-2.132.30-MINARG/api/articulos/${codigoInterno}?disponibilidadDistribucion=%7B%22fecha%22:null,%22tipoDisponibilidadDistribucion%22:%22IMMEDIATE%22%7D&filter=codigoListaPrecioVenta%253AEQ%253A3163`;
        const resPesada = await fetch(urlPesada, { method: "GET", headers: headersScanntech });
        const articuloCompleto = await resPesada.json();

        res.json({ exito: true, articulo: articuloCompleto });
    } catch (error) {
        res.status(500).json({ exito: false, error: "Error interno en buscador" });
    }
});

// 2. ACTUALIZADOR DE PRECIOS
app.post('/modificar-precio', async (req, res) => {
    console.log("¡Recibida orden de actualización de precio!");
    try {
        const respuestaScanntech = await fetch("https://backend-k8.scanntech.com/be-modulos-precios-angular-2.132.30-MINARG/api/articulos/salvar-lote", {
            method: "PUT",
            headers: headersScanntech,
            body: JSON.stringify(req.body)
        });

        if (respuestaScanntech.ok) {
            const respuestaJSON = await respuestaScanntech.json();
            console.log("¡Cambio de precio exitoso! Respuesta:", JSON.stringify(respuestaJSON));
            res.json({ exito: true, data: respuestaJSON });
        } else {
            const motivo = await respuestaScanntech.text();
            console.log("Scanntech rebotó precio. Error:", respuestaScanntech.status, motivo);
            res.status(400).json({ exito: false });
        }
    } catch (error) {
        console.error("Error en escritura de precio:", error);
        res.status(500).json({ exito: false });
    }
});

// 3. CAÑÓN DE DISTRIBUCIÓN A CAJAS
app.post('/distribuir', async (req, res) => {
    console.log("¡Orden de distribución a cajas recibida!");
    try {
        const urlDistribucion = "https://modulos-be-minoristas.scanntech.com/be-modulos-distribuciones-tareas-angular_1.1.13/api/distribuciones-tareas-locales-unificadas/completar-sin-imprimir?completarParaTodosLosLocales=true";
        const respuestaDist = await fetch(urlDistribucion, {
            method: "PUT",
            headers: headersScanntech,
            body: JSON.stringify(req.body)
        });

        if (respuestaDist.ok) {
            console.log("¡Distribución exitosa!");
            res.json({ exito: true });
        } else {
            const motivo = await respuestaDist.text();
            console.log("Rebotó distribución. Error:", respuestaDist.status, motivo);
            res.status(400).json({ exito: false, error: motivo });
        }
    } catch (error) {
        console.error("Error al distribuir:", error);
        res.status(500).json({ exito: false });
    }
});

// 4. NUEVO CAÑÓN: MOVIMIENTOS DE INVENTARIO (STOCK)
app.post('/actualizar-stock', async (req, res) => {
    console.log("¡Recibida orden de movimiento de stock!");
    try {
        const urlStock = "https://modulos-be-2-minoristas.scanntech.com/be-modulos-inventario-angular/api/movimiento";
        const respuestaStock = await fetch(urlStock, {
            method: "POST",
            headers: headersScanntech,
            body: JSON.stringify(req.body)
        });

        if (respuestaStock.ok) {
            console.log("¡Movimiento de stock impactado en Scanntech!");
            res.json({ exito: true });
        } else {
            const motivo = await respuestaStock.text();
            console.log("Scanntech rebotó el stock. Error:", respuestaStock.status, motivo);
            res.status(400).json({ exito: false, error: motivo });
        }
    } catch (error) {
        console.error("Error en conexión de stock:", error);
        res.status(500).json({ exito: false });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor ACTIVO en el puerto ${PORT}`);
});

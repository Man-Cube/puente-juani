const express = require('express');
const cors = require('cors');

const app = report || express();
app.use(cors()); 
app.use(express.json()); 

const headersScanntech = {
    "Authorization": "Basic QUQxMTE0OCRpcG9zc2IzYXI6R1VTVEkxMA==",
    "Content-Type": "application/json",
    "emp_codigo": "11148",
    "gestion": "1222"
};

// 1. EL BUSCADOR EN 2 PASOS (Intacto)
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
        res.status(500).json({ exito: false, error: "Error interno" });
    }
});

// 2. EL ACTUALIZADOR DE PRECIOS Y COSTOS (Intacto)
app.post('/modificar-precio', async (req, res) => {
    console.log("¡Recibida orden de precio!");
    try {
        const respuestaScanntech = await fetch("https://backend-k8.scanntech.com/be-modulos-precios-angular-2.132.30-MINARG/api/articulos/salvar-lote", {
            method: "PUT",
            headers: headersScanntech,
            body: JSON.stringify(req.body)
        });

        if (respuestaScanntech.ok) {
            const respuestaJSON = await respuestaScanntech.json();
            res.json({ exito: true, data: respuestaJSON });
        } else {
            res.status(400).json({ exito: false });
        }
    } catch (error) {
        res.status(500).json({ exito: false });
    }
});

// 3. EL DISTRIBUIDOR A CAJAS (Intacto)
app.post('/distribuir', async (req, res) => {
    console.log("¡Orden de distribución recibida!");
    try {
        const urlDistribucion = "https://modulos-be-minoristas.scanntech.com/be-modulos-distribuciones-tareas-angular_1.1.13/api/distribuciones-tareas-locales-unificadas/completar-sin-imprimir?completarParaTodosLosLocales=true";
        const respuestaDist = await fetch(urlDistribucion, {
            method: "PUT",
            headers: headersScanntech,
            body: JSON.stringify(req.body)
        });
        if (respuestaDist.ok) res.json({ exito: true });
        else res.status(400).json({ exito: false });
    } catch (error) {
        res.status(500).json({ exito: false });
    }
});

// 4. NUEVO CAÑÓN: AJUSTE DE STOCK DE MERCADERÍA 📦
app.post('/ajustar-stock', async (req, res) => {
    console.log("¡Recibida orden de ajuste de inventario, Chacho!");
    try {
        const urlInventario = "https://modulos-be-2-minoristas.scanntech.com/be-modulos-inventario-angular/api/movimiento";
        const respuestaStock = await fetch(urlInventario, {
            method: "POST",
            headers: headersScanntech,
            body: JSON.stringify(req.body)
        });

        if (respuestaStock.ok) {
            console.log("¡Ajuste de stock impactado con éxito en Scanntech!");
            res.json({ exito: true });
        } else {
            const motivo = await respuestaStock.text();
            console.log("Scanntech rebotó el stock. Código:", respuestaStock.status, motivo);
            res.status(400).json({ exito: false, error: motivo });
        }
    } catch (error) {
        console.error("Error en puente de inventario:", error);
        res.status(500).json({ exito: false });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor de Autoservicio Juani ACTIVO en puerto ${PORT}`);
});

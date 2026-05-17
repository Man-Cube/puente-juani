const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors()); 
app.use(express.json()); 

// Tus credenciales oficiales
const headersScanntech = {
    "Authorization": "Basic QUQxMTE0OCRpcG9zc2IzYXI6R1VTVEkxMA==",
    "Content-Type": "application/json",
    "emp_codigo": "11148",
    "gestion": "1222"
};

// EL BUSCADOR INTELIGENTE EN 2 PASOS
app.get('/buscar/:codigo', async (req, res) => {
    const codigoLeido = req.params.codigo;
    console.log("Buscando artículo, Chacho. Código:", codigoLeido);
    
    try {
        // PASO 1: Buscar la "cáscara" para sacar el código interno de Scanntech
        let urlBasica = `https://backend-k8.scanntech.com/be-modulos-precios-angular-2.132.30-MINARG/api/datos-basicos-articulos?filter=codigoBarras%253AEQ%253A${codigoLeido}`;
        let resBasica = await fetch(urlBasica, { method: "GET", headers: headersScanntech });
        let dataBasica = await resBasica.json();
        
        let articuloBasico = Array.isArray(dataBasica) ? dataBasica[0] : (dataBasica.content ? dataBasica.content[0] : (dataBasica.codigo ? dataBasica : null));

        // Si no lo encuentra por código de barras, probamos por el código corto interno (PLU)
        if (!articuloBasico) {
            urlBasica = `https://backend-k8.scanntech.com/be-modulos-precios-angular-2.132.30-MINARG/api/datos-basicos-articulos?filter=codigoExterno%253AEQ%253A${codigoLeido}`;
            resBasica = await fetch(urlBasica, { method: "GET", headers: headersScanntech });
            dataBasica = await resBasica.json();
            articuloBasico = Array.isArray(dataBasica) ? dataBasica[0] : (dataBasica.content ? dataBasica.content[0] : (dataBasica.codigo ? dataBasica : null));
        }

        if (!articuloBasico || !articuloBasico.codigo) {
            return res.status(404).json({ exito: false, error: "Artículo fantasma" });
        }

        // PASO 2: Con el código interno, vamos a buscar la caja fuerte con tu link nuevo
        const codigoInterno = articuloBasico.codigo;
        console.log("Código interno encontrado:", codigoInterno, "- Buscando la plata...");
        
        const urlPesada = `https://backend-k8.scanntech.com/be-modulos-precios-angular-2.132.30-MINARG/api/articulos/${codigoInterno}?disponibilidadDistribucion=%7B%22fecha%22:null,%22tipoDisponibilidadDistribucion%22:%22IMMEDIATE%22%7D&filter=codigoListaPrecioVenta%253AEQ%253A3163`;
        const resPesada = await fetch(urlPesada, { method: "GET", headers: headersScanntech });
        const articuloCompleto = await resPesada.json();

        // Le mandamos la ficha repleta de datos a tu celular
        res.json({ exito: true, articulo: articuloCompleto });

    } catch (error) {
        console.error("Error en el buscador 2 pasos:", error);
        res.status(500).json({ exito: false, error: "Error interno" });
    }
});

// EL ACTUALIZADOR (El que ya probamos y anda perfecto)
app.post('/modificar-precio', async (req, res) => {
    console.log("¡Recibida orden de actualización de precio!");
    try {
        const respuestaScanntech = await fetch("https://backend-k8.scanntech.com/be-modulos-precios-angular-2.132.30-MINARG/api/articulos/salvar-lote", {
            method: "PUT",
            headers: headersScanntech,
            body: JSON.stringify(req.body)
        });

        if (respuestaScanntech.ok) {
            console.log("¡Scanntech aceptó el cambio!");
            res.json({ exito: true });
        } else {
            const motivo = await respuestaScanntech.text();
            console.log("Scanntech rebotó. Error:", respuestaScanntech.status, motivo);
            res.status(400).json({ exito: false });
        }
    } catch (error) {
        console.error("Error en escritura:", error);
        res.status(500).json({ exito: false });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor de Autoservicio Juani ACTIVO en el puerto ${PORT}`);
});

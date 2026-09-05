-- Point 27: editable WhatsApp support configuration.
CREATE TABLE "ConfiguracionSoporte" (
    "id" VARCHAR(30) NOT NULL DEFAULT 'principal',
    "numeroWhatsapp" VARCHAR(15),
    "mensajeWhatsapp" VARCHAR(300) NOT NULL DEFAULT 'Hola, necesito ayuda con SaberPlus.',
    "activo" BOOLEAN NOT NULL DEFAULT false,
    "fechaActualizacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfiguracionSoporte_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ConfiguracionSoporte" ("id") VALUES ('principal');

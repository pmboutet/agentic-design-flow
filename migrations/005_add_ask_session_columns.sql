-- Migration pour ajouter les colonnes manquantes à la table ask_sessions
-- Ces colonnes sont nécessaires pour le fonctionnement des sessions ASK

-- Ajouter les colonnes manquantes à ask_sessions
ALTER TABLE ask_sessions 
ADD COLUMN IF NOT EXISTS delivery_mode VARCHAR(20) DEFAULT 'digital',
ADD COLUMN IF NOT EXISTS audience_scope VARCHAR(20) DEFAULT 'individual', 
ADD COLUMN IF NOT EXISTS response_mode VARCHAR(20) DEFAULT 'collective';

-- Ajouter la colonne is_spokesperson à ask_participants si elle n'existe pas
ALTER TABLE ask_participants 
ADD COLUMN IF NOT EXISTS is_spokesperson BOOLEAN DEFAULT false;

-- Mettre à jour les sessions existantes avec des valeurs par défaut appropriées
UPDATE ask_sessions 
SET 
  delivery_mode = COALESCE(delivery_mode, 'digital'),
  audience_scope = COALESCE(audience_scope, 
    CASE 
      WHEN max_participants = 1 OR max_participants IS NULL THEN 'individual' 
      ELSE 'group' 
    END),
  response_mode = COALESCE(response_mode, 'collective')
WHERE delivery_mode IS NULL OR audience_scope IS NULL OR response_mode IS NULL;

-- Ajouter des contraintes pour s'assurer que les valeurs sont valides
ALTER TABLE ask_sessions 
ADD CONSTRAINT check_delivery_mode 
CHECK (delivery_mode IN ('digital', 'physical'));

ALTER TABLE ask_sessions 
ADD CONSTRAINT check_audience_scope 
CHECK (audience_scope IN ('individual', 'group'));

ALTER TABLE ask_sessions 
ADD CONSTRAINT check_response_mode 
CHECK (response_mode IN ('collective', 'simultaneous'));

-- Commentaires pour documenter les colonnes
COMMENT ON COLUMN ask_sessions.delivery_mode IS 'Mode de livraison de la session: digital ou physical';
COMMENT ON COLUMN ask_sessions.audience_scope IS 'Portée de l''audience: individual ou group';
COMMENT ON COLUMN ask_sessions.response_mode IS 'Mode de réponse: collective ou simultaneous';
COMMENT ON COLUMN ask_participants.is_spokesperson IS 'Indique si le participant est le porte-parole principal';

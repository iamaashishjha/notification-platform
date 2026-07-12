ALTER TABLE tenant_features
    DROP CONSTRAINT IF EXISTS tenant_features_feature_identifier_fkey;

DROP TABLE IF EXISTS feature_catalog;

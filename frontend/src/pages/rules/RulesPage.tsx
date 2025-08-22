import React from 'react';
import { Box, Typography, Paper } from '@mui/material';
import { Helmet } from 'react-helmet-async';

const RulesPage: React.FC = () => {
  return (
    <>
      <Helmet>
        <title>Detection Rules - AF-TMS</title>
      </Helmet>
      
      <Box>
        <Typography variant="h4" fontWeight="bold" gutterBottom>
          Detection Rules Engine
        </Typography>
        <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 3 }}>
          Configure and manage fraud detection rules
        </Typography>
        
        <Paper sx={{ p: 3 }}>
          <Typography>
            Detection rules interface will be implemented here, including:
          </Typography>
          <ul>
            <li>Rule creation and configuration</li>
            <li>Rule testing and validation</li>
            <li>Rule performance monitoring</li>
            <li>Rule templates and best practices</li>
            <li>Rule version control and audit</li>
          </ul>
        </Paper>
      </Box>
    </>
  );
};

export default RulesPage;

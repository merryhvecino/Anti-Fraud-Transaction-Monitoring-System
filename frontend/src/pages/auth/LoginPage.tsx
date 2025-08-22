import React, { useState } from 'react';
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  Alert,
  InputAdornment,
  IconButton,
  Divider,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  Security,
  AccountBalance,
} from '@mui/icons-material';
import { useForm } from 'react-hook-form';
import { Helmet } from 'react-helmet-async';

import { useAuth } from '../../hooks/useAuth';
import { LoginRequest } from '../../types';

const LoginPage: React.FC = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginRequest>();

  const onSubmit = async (data: LoginRequest) => {
    try {
      setError(null);
      await login(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    }
  };

  const handleTogglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <>
      <Helmet>
        <title>Login - AF-TMS</title>
      </Helmet>
      
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          bgcolor: 'primary.main',
          background: 'linear-gradient(135deg, #1976d2 0%, #1565c0 100%)',
        }}
      >
        {/* Left side - Branding */}
        <Box
          sx={{
            flex: 1,
            display: { xs: 'none', md: 'flex' },
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            color: 'white',
            p: 4,
          }}
        >
          <Security sx={{ fontSize: 80, mb: 2 }} />
          <Typography variant="h3" fontWeight="bold" gutterBottom align="center">
            AF-TMS
          </Typography>
          <Typography variant="h5" gutterBottom align="center">
            Anti-Fraud Transaction Monitoring System
          </Typography>
          <Typography variant="subtitle1" align="center" sx={{ mt: 2, maxWidth: 400 }}>
            Comprehensive fraud detection and compliance monitoring for New Zealand financial institutions
          </Typography>
          
          <Box sx={{ mt: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
            <AccountBalance />
            <Typography variant="body2">
              Trusted by leading NZ financial institutions
            </Typography>
          </Box>
        </Box>

        {/* Right side - Login Form */}
        <Box
          sx={{
            flex: { xs: 1, md: 0.5 },
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            p: 3,
          }}
        >
          <Paper
            elevation={8}
            sx={{
              p: 4,
              width: '100%',
              maxWidth: 400,
              borderRadius: 3,
            }}
          >
            {/* Mobile Logo */}
            <Box sx={{ display: { xs: 'flex', md: 'none' }, justifyContent: 'center', mb: 3 }}>
              <Security sx={{ fontSize: 48, color: 'primary.main' }} />
            </Box>

            <Typography variant="h4" fontWeight="bold" gutterBottom>
              Welcome Back
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Sign in to access the fraud monitoring dashboard
            </Typography>

            {error && (
              <Alert severity="error" sx={{ mb: 3 }}>
                {error}
              </Alert>
            )}

            <form onSubmit={handleSubmit(onSubmit)}>
              <TextField
                fullWidth
                label="Username"
                variant="outlined"
                margin="normal"
                {...register('username', {
                  required: 'Username is required',
                  minLength: {
                    value: 3,
                    message: 'Username must be at least 3 characters',
                  },
                })}
                error={!!errors.username}
                helperText={errors.username?.message}
                disabled={isSubmitting}
              />

              <TextField
                fullWidth
                label="Password"
                type={showPassword ? 'text' : 'password'}
                variant="outlined"
                margin="normal"
                {...register('password', {
                  required: 'Password is required',
                  minLength: {
                    value: 6,
                    message: 'Password must be at least 6 characters',
                  },
                })}
                error={!!errors.password}
                helperText={errors.password?.message}
                disabled={isSubmitting}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label="toggle password visibility"
                        onClick={handleTogglePasswordVisibility}
                        edge="end"
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={isSubmitting}
                sx={{ mt: 3, mb: 2, py: 1.5 }}
              >
                {isSubmitting ? 'Signing In...' : 'Sign In'}
              </Button>
            </form>

            <Divider sx={{ my: 3 }} />

            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                For account issues, contact your system administrator
              </Typography>
            </Box>

            {/* Demo Credentials */}
            {process.env.NODE_ENV === 'development' && (
              <Box sx={{ mt: 3, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                <Typography variant="caption" display="block" gutterBottom>
                  Demo Credentials:
                </Typography>
                <Typography variant="caption" display="block">
                  Username: admin | Password: admin123
                </Typography>
                <Typography variant="caption" display="block">
                  Username: analyst | Password: analyst123
                </Typography>
              </Box>
            )}
          </Paper>
        </Box>
      </Box>
    </>
  );
};

export default LoginPage;

#!/bin/bash
export PATH=$PATH:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
npm run build
zip -r extension.zip dist/*
echo "Build and pack complete!"

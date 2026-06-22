#!/usr/bin/env python3
"""Use AkShare to build accurate industry classification for all A-stocks."""
import json
import sys
from collections import Counter

try:
    import akshare as ak
except ImportError:
    print("akshare not installed")
    sys.exit(1)

def main():
    print("Fetching industry boards from AkShare...")
    
    # Get all industry boards (东方财富行业板块)
    try:
        industry_boards = ak.stock_board_industry_name_em()
        print(f"Industry boards: {len(industry_boards)}")
        print(industry_boards.head(20).to_string())
    except Exception as e:
        print(f"Failed to get industry boards: {e}")
    
    # Get all concept boards
    try:
        concept_boards = ak.stock_board_concept_name_em()
        print(f"\nConcept boards: {len(concept_boards)}")
        print(concept_boards.head(20).to_string())
    except Exception as e:
        print(f"Failed to get concept boards: {e}")

    # Try to get stock info directly
    try:
        stock_info = ak.stock_info_a_code_name()
        print(f"\nA-stock info columns: {list(stock_info.columns)}")
        print(stock_info.head(10).to_string())
    except Exception as e:
        print(f"Failed to get stock info: {e}")

if __name__ == '__main__':
    main()

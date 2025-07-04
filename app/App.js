import React from 'react';
import {StyleSheet, View, Text, Button, Image} from "react-native";
import bookList from "../assets/bookList_LOGO.png"
export default function App() {
    return (
        <View style={styles.container}>
            <Image
                source={bookList}
                style={styles.image}
            />

            <Text style={[styles.title, {color : 'black'}]}>Hello World</Text>
            <Text style={{marginTop : 10, marginBottom : 30}}>
                First App
            </Text>

        </View>




    )
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'beige',
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontWeight: 'bold',
        fontSize: 18,
    },
    card: {
        backgroundColor: '#eee',
        padding: 20,
        borderRadius: 5,

        // iOS
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 5,

        // Android
        elevation: 4,
    },
    image: {
        marginVertical: 20,
        width: 100,
        height: 100,
        resizeMode: 'cover',
    }
});
